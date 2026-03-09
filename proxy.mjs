// proxy.mjs — Cloudflare Worker (ES Module)

const OREF_HEADERS = {
  "User-Agent": "Mozilla/5.0",
  Referer: "https://www.oref.org.il/",
  "X-Requested-With": "XMLHttpRequest",
};

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Content-Type": "application/json",
};

// ── Fetching ──────────────────────────────────────────────────────────────
async function fetchRaw(url, headers) {
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}`);
  return res.text();
}

async function fetchJson(url, headers) {
  const text = await fetchRaw(url, headers);
  return JSON.parse(text);
}

// ── Alert normalization ───────────────────────────────────────────────────
function normalizeAlert(item) {
  return {
    alertDate: item.alertDate,
    title: item.title ?? item.category_desc,
    data: item.data,
    category: item.category,
  };
}

function deduplicationKey(alert) {
  const normalized = alert.alertDate.replace("T", " ").slice(0, 16);
  return `${normalized}|${alert.data}`;
}

function deduplicateAlerts(alerts) {
  const seen = new Set();
  const result = [];

  for (const a of alerts) {
    const key = deduplicationKey(a);
    if (!seen.has(key)) {
      seen.add(key);
      result.push(a);
    }
  }

  return result;
}

async function fetchMergedAlerts() {
  const [primary, history] = await Promise.allSettled([
    fetchJson("https://www.oref.org.il/warningMessages/alert/History/AlertsHistory.json", OREF_HEADERS),
    fetchJson("https://alerts-history.oref.org.il/Shared/Ajax/GetAlarmsHistory.aspx", OREF_HEADERS),
  ]);

  const MAX_ALERTS = 100;

  const fromPrimary =
    primary.status === "fulfilled" && Array.isArray(primary.value)
      ? primary.value.slice(0, MAX_ALERTS).map(normalizeAlert)
      : [];

  const fromHistory =
    history.status === "fulfilled" && Array.isArray(history.value)
      ? history.value.slice(0, MAX_ALERTS).map(normalizeAlert)
      : [];
  if (!fromPrimary.length && !fromHistory.length) {
    throw new Error("Both oref sources failed");
  }

  return deduplicateAlerts([...fromPrimary, ...fromHistory]);
}

// ── Localized alerts ──────────────────────────────────────────────────────
function buildUrl(base, params) {
  const url = new URL(base);
  Object.entries(params).forEach(([key, value]) => url.searchParams.append(key, value));
  return url.toString();
}

async function fetchLocalizedAlerts(city, lang = "he", mode = 1) {
  const url = buildUrl("https://alerts-history.oref.org.il//Shared/Ajax/GetAlarmsHistory.aspx", {
    lang,
    mode,
    city_0: city,
  });
  const alerts = await fetchJson(url, OREF_HEADERS);
  return Array.isArray(alerts) ? alerts.map(normalizeAlert) : [];
}

// ── Route map ─────────────────────────────────────────────────────────────
const ROUTES = {
  "/oref": async (request) => {
    const url = new URL(request.url);
    const city = url.searchParams.get("city");

    if (city) {
      // Fetch only localized alerts if `city` parameter is provided
      const alerts = await fetchLocalizedAlerts(city);
      return JSON.stringify(deduplicateAlerts(alerts));
    } else {
      // Fetch general alerts (no city filter)
      const alerts = await fetchMergedAlerts();
      return JSON.stringify(alerts);
    }
  },
  "/emess": () => fetchRaw("https://www.emess.co.il/Online/Feed/0", { "User-Agent": "Mozilla/5.0" }),
};

// ── Worker entry point ────────────────────────────────────────────────────
export default {
  async fetch(request, env, ctx) {
    const { pathname } = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: { "Access-Control-Allow-Origin": "*" } });
    }

    const handler = ROUTES[pathname];
    if (handler) {
      try {
        const body = await handler(request);
        return new Response(typeof body === "string" ? body : JSON.stringify(body), {
          status: 200,
          headers: CORS_HEADERS,
        });
      } catch (err) {
        return new Response(`Upstream error: ${err.message}`, { status: 502 });
      }
    }

    // Serve static assets (HTML, etc.)
    return env.ASSETS.fetch(request);
  },
};
