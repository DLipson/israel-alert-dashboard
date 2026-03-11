// proxy.mjs — Cloudflare Worker (ES Module)

const OREF_HEADERS = {
  "User-Agent": "Mozilla/5.0",
  Referer: "https://www.oref.org.il/",
  "X-Requested-With": "XMLHttpRequest",
};

const OREF_ENDPOINTS = {
  primary: "https://www.oref.org.il/warningMessages/alert/History/AlertsHistory.json",
  history: "https://alerts-history.oref.org.il/Shared/Ajax/GetAlarmsHistory.aspx",
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

const MAX_ALERTS = 100;

function normalizeAlerts(raw) {
  return Array.isArray(raw) ? raw.map(normalizeAlert) : [];
}

async function fetchPrimaryAlerts() {
  const data = await fetchJson(OREF_ENDPOINTS.primary, OREF_HEADERS);
  return normalizeAlerts(data).slice(0, MAX_ALERTS);
}

async function fetchHistoryAlerts() {
  const data = await fetchJson(OREF_ENDPOINTS.history, OREF_HEADERS);
  return normalizeAlerts(data).slice(0, MAX_ALERTS);
}

async function fetchMergedAlerts() {
  const [primary, history] = await Promise.allSettled([
    fetchPrimaryAlerts(),
    fetchHistoryAlerts(),
  ]);

  const fromPrimary =
    primary.status === "fulfilled" && Array.isArray(primary.value)
      ? primary.value
      : [];

  const fromHistory =
    history.status === "fulfilled" && Array.isArray(history.value)
      ? history.value
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

function parseOrefParams(request) {
  const url = new URL(request.url);
  const city = url.searchParams.get("city");
  const lang = url.searchParams.get("lang") ?? "he";
  const modeRaw = url.searchParams.get("mode");
  const mode = Number.isFinite(Number(modeRaw)) ? Number(modeRaw) : 1;
  return { city, lang, mode };
}

async function fetchLocalizedAlerts(city, lang = "he", mode = 1) {
  const url = buildUrl(OREF_ENDPOINTS.history, {
    lang,
    mode,
    city_0: city,
  });
  const alerts = await fetchJson(url, OREF_HEADERS);
  return normalizeAlerts(alerts).slice(0, MAX_ALERTS);
}

// ── Route map ─────────────────────────────────────────────────────────────
const ROUTES = {
  "/oref": async (request) => {
    const { city, lang, mode } = parseOrefParams(request);

    if (city) {
      // Fetch only localized alerts if `city` parameter is provided
      const alerts = await fetchLocalizedAlerts(city, lang, mode);
      return deduplicateAlerts(alerts);
    }

    // Fetch general alerts (no city filter)
    const alerts = await fetchMergedAlerts();
    return deduplicateAlerts(alerts);
  },
  "/oref-primary": async () => {
    const alerts = await fetchPrimaryAlerts();
    return deduplicateAlerts(alerts);
  },
  "/oref-history": async (request) => {
    const { city, lang, mode } = parseOrefParams(request);

    if (city) {
      const alerts = await fetchLocalizedAlerts(city, lang, mode);
      return deduplicateAlerts(alerts);
    }

    const alerts = await fetchHistoryAlerts();
    return deduplicateAlerts(alerts);
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
