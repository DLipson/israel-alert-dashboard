// proxy.mjs — Cloudflare Worker (ES Module)

const OREF_HEADERS = {
  "User-Agent": "Mozilla/5.0",
  Referer: "https://www.oref.org.il/",
  "X-Requested-With": "XMLHttpRequest",
};

const OREF_ENDPOINTS = {
  primary: "https://www.oref.org.il/warningMessages/alert/History/AlertsHistory.json",
  history: "https://alerts-history.oref.org.il/Shared/Ajax/GetAlarmsHistory.aspx",
  live: "https://www.oref.org.il/warningMessages/alert/Alerts.json",
};

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "X-Debug-Log",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Expose-Headers": "X-Upstream-Urls",
  "Content-Type": "application/json",
};

const DEBUG_HEADER = "X-Debug-Log";
const UPSTREAM_HEADER = "X-Upstream-Urls";

function shouldLogUpstream(request) {
  return request.headers.get(DEBUG_HEADER) === "1";
}

function logUpstream(options, label, url) {
  if (!options?.debug) return;
  console.log(`[proxy] ${label}: ${url}`);
}

function trackUpstream(options, label, url) {
  logUpstream(options, label, url);
  if (options?.collector) options.collector.push(url);
}

// ── Fetching ──────────────────────────────────────────────────────────────
async function fetchRaw(url, headers, options, label) {
  trackUpstream(options, label, url);
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}`);
  return res.text();
}

async function fetchJson(url, headers, options, label) {
  const text = await fetchRaw(url, headers, options, label);
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

function parseLiveAlertDate(candidate) {
  if (candidate === null || candidate === undefined) return null;
  if (typeof candidate === "number" && Number.isFinite(candidate)) {
    const ms = candidate > 1e12 ? candidate : candidate * 1000;
    return new Date(ms).toISOString();
  }
  if (typeof candidate === "string") {
    const parsed = Date.parse(candidate);
    if (!Number.isNaN(parsed)) return new Date(parsed).toISOString();
  }
  return null;
}

function getLiveAlertDate(item) {
  const candidates = [item?.alertDate, item?.date, item?.time, item?.id];
  for (const candidate of candidates) {
    const parsed = parseLiveAlertDate(candidate);
    if (parsed) return parsed;
  }
  return new Date().toISOString();
}

function formatLiveAlertData(desc, locations) {
  const locationText = locations.filter(Boolean).join(", ");
  if (desc && locationText) return `${desc} — ${locationText}`;
  return desc || locationText;
}

function normalizeLiveAlert(item, city) {
  const locations = Array.isArray(item?.data)
    ? item.data.map((entry) => String(entry))
    : item?.data
      ? [String(item.data)]
      : [];
  const filteredLocations = city
    ? locations.filter((entry) => entry.includes(city))
    : locations;

  if (city && filteredLocations.length === 0) return null;

  const desc = item?.desc ? String(item.desc) : "";
  const categoryValue = item?.cat;
  const category = Number.isFinite(Number(categoryValue))
    ? Number(categoryValue)
    : categoryValue;

  return {
    alertDate: getLiveAlertDate(item),
    title: item?.title ?? desc ?? "Alert",
    data: formatLiveAlertData(desc, filteredLocations),
    category,
  };
}

function normalizeLiveAlerts(raw, city) {
  if (!raw) return [];
  const items = Array.isArray(raw) ? raw : [raw];
  return items
    .map((item) => normalizeLiveAlert(item, city))
    .filter(Boolean);
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

function alertTimestamp(alert) {
  const raw = alert?.alertDate ?? "";
  const normalized = raw.replace(" ", "T");
  const timestamp = Date.parse(normalized);
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

function finalizeAlerts(alerts) {
  return deduplicateAlerts(alerts)
    .sort((a, b) => alertTimestamp(b) - alertTimestamp(a))
    .slice(0, MAX_ALERTS);
}

async function fetchPrimaryAlerts(options) {
  const data = await fetchJson(
    OREF_ENDPOINTS.primary,
    OREF_HEADERS,
    options,
    "OREF primary"
  );
  return normalizeAlerts(data);
}

async function fetchHistoryAlerts(options) {
  const data = await fetchJson(
    OREF_ENDPOINTS.history,
    OREF_HEADERS,
    options,
    "OREF history"
  );
  return normalizeAlerts(data);
}

async function fetchLiveAlerts(city, options) {
  const data = await fetchJson(
    OREF_ENDPOINTS.live,
    OREF_HEADERS,
    options,
    "OREF live"
  );
  return normalizeLiveAlerts(data, city);
}

async function fetchMergedAlerts(options) {
  const [primary, history] = await Promise.allSettled([
    fetchPrimaryAlerts(options),
    fetchHistoryAlerts(options),
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

  return finalizeAlerts([...fromPrimary, ...fromHistory]);
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
  const mode =
    modeRaw === null
      ? 1
      : Number.isFinite(Number(modeRaw))
        ? Number(modeRaw)
        : 1;
  return { city, lang, mode };
}

async function fetchLocalizedAlerts(city, lang = "he", mode = 1, options) {
  const url = buildUrl(OREF_ENDPOINTS.history, {
    lang,
    mode,
    city_0: city,
  });
  const alerts = await fetchJson(url, OREF_HEADERS, options, "OREF history city");
  return normalizeAlerts(alerts);
}

// ── Route map ─────────────────────────────────────────────────────────────
const ROUTES = {
  "/oref": async (request, options) => {
    const { city, lang, mode } = parseOrefParams(request);

    if (city) {
      // Fetch only localized alerts if `city` parameter is provided
      const alerts = await fetchLocalizedAlerts(city, lang, mode, options);
      return finalizeAlerts(alerts);
    }

    // Fetch general alerts (no city filter)
    const alerts = await fetchMergedAlerts(options);
    return alerts;
  },
  "/oref-primary": async (request, options) => {
    const alerts = await fetchPrimaryAlerts(options);
    return finalizeAlerts(alerts);
  },
  "/oref-history": async (request, options) => {
    const { city, lang, mode } = parseOrefParams(request);

    if (city) {
      const alerts = await fetchLocalizedAlerts(city, lang, mode, options);
      return finalizeAlerts(alerts);
    }

    const alerts = await fetchHistoryAlerts(options);
    return finalizeAlerts(alerts);
  },
  "/oref-live": async (request, options) => {
    const { city } = parseOrefParams(request);
    const alerts = await fetchLiveAlerts(city, options);
    return finalizeAlerts(alerts);
  },
  "/emess": (request, options) => {
    return fetchRaw(
      "https://www.emess.co.il/Online/Feed/0",
      { "User-Agent": "Mozilla/5.0" },
      options,
      "Emess feed"
    );
  },
};

function buildResponseHeaders(debug, upstreamUrls) {
  if (!debug || !upstreamUrls?.length) return CORS_HEADERS;
  const unique = Array.from(new Set(upstreamUrls));
  return {
    ...CORS_HEADERS,
    [UPSTREAM_HEADER]: JSON.stringify(unique),
  };
}

// ── Worker entry point ────────────────────────────────────────────────────
export default {
  async fetch(request, env, ctx) {
    const { pathname } = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    const handler = ROUTES[pathname];
    if (handler) {
      try {
        const debug = shouldLogUpstream(request);
        const upstreamUrls = [];
        const body = await handler(request, { debug, collector: upstreamUrls });
        return new Response(typeof body === "string" ? body : JSON.stringify(body), {
          status: 200,
          headers: buildResponseHeaders(debug, upstreamUrls),
        });
      } catch (err) {
        return new Response(`Upstream error: ${err.message}`, { status: 502 });
      }
    }

    // Serve static assets (HTML, etc.)
    return env.ASSETS.fetch(request);
  },
};
