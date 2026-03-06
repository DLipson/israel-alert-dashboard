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
  return alerts.filter((a) => {
    const key = deduplicationKey(a);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function fetchMergedAlerts() {
  const [primary, history] = await Promise.allSettled([
    fetchJson("https://www.oref.org.il/warningMessages/alert/History/AlertsHistory.json", OREF_HEADERS),
    fetchJson("https://alerts-history.oref.org.il/Shared/Ajax/GetAlarmsHistory.aspx", OREF_HEADERS),
  ]);

  const fromPrimary =
    primary.status === "fulfilled" && Array.isArray(primary.value) ? primary.value.map(normalizeAlert) : [];
  const fromHistory =
    history.status === "fulfilled" && Array.isArray(history.value) ? history.value.map(normalizeAlert) : [];

  if (!fromPrimary.length && !fromHistory.length) {
    throw new Error("Both oref sources failed");
  }

  return JSON.stringify(deduplicateAlerts([...fromPrimary, ...fromHistory]));
}

// ── Route map ─────────────────────────────────────────────────────────────
const ROUTES = {
  "/oref": fetchMergedAlerts,
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
        const body = await handler();
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
