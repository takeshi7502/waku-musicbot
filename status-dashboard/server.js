"use strict";

const fs = require("node:fs");
const http = require("node:http");
const https = require("node:https");
const path = require("node:path");
const { URL } = require("node:url");

const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, "public");
const CONFIG_PATH = path.join(ROOT, "config.json");
const DATA_DIR = path.join(ROOT, "data");
const UPTIME_HISTORY_PATH = path.join(DATA_DIR, "uptime-history.json");
const REQUEST_TIMEOUT_MS = 3500;
const UPTIME_WINDOW_MS = 24 * 60 * 60 * 1000;
const UPTIME_SAMPLE_MS = 60 * 1000;
const SOURCE_PRIORITY = [
  "youtube",
  "soundcloud",
  "spotify",
  "applemusic",
  "deezer",
  "yandexmusic",
  "bandcamp",
  "twitch",
  "vimeo",
  "http"
];

const CONTENT_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml"
};

function loadConfig() {
  if (!fs.existsSync(CONFIG_PATH)) {
    throw new Error(
      `Missing ${CONFIG_PATH}. Copy config.example.json to config.json and enter the local Lavalink password.`
    );
  }

  // PowerShell 5 may write UTF-8 JSON with a BOM; Node's JSON.parse does not strip it.
  const config = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8").replace(/^\uFEFF/, ""));
  const host = config.listen?.host || "127.0.0.1";
  const port = Number(config.listen?.port || 3010);
  const lavalinkUrl = config.lavalink?.url;
  const password = config.lavalink?.password;

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("listen.port must be a valid TCP port.");
  }
  if (!lavalinkUrl || !password || password === "REPLACE_WITH_YOUR_LAVALINK_PASSWORD") {
    throw new Error("lavalink.url and lavalink.password must be configured in config.json.");
  }

  return {
    listen: { host, port },
    lavalink: { url: new URL(lavalinkUrl), password },
    dashboard: {
      nodeName: String(config.dashboard?.nodeName || "Lavalink").slice(0, 100),
      refreshSeconds: clamp(Number(config.dashboard?.refreshSeconds || 5), 3, 60),
      news: Array.isArray(config.dashboard?.news) ? config.dashboard.news.slice(0, 8) : []
    }
  };
}

function clamp(value, min, max) {
  return Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : min;
}

const config = loadConfig();
let uptimeHistory = loadUptimeHistory();
let statusCache = unavailableStatusPayload();
let statusRefreshInFlight = null;
const statusSubscribers = new Set();

function loadUptimeHistory() {
  try {
    const stored = JSON.parse(fs.readFileSync(UPTIME_HISTORY_PATH, "utf8"));
    return Array.isArray(stored?.samples)
      ? stored.samples.filter((entry) => Number.isFinite(entry?.at) && typeof entry?.online === "boolean")
      : [];
  } catch {
    return [];
  }
}

function recordAvailability(online) {
  const now = Date.now();
  const cutoff = now - UPTIME_WINDOW_MS;
  uptimeHistory = uptimeHistory.filter((entry) => entry.at >= cutoff);
  const last = uptimeHistory.at(-1);

  if (last && now - last.at < UPTIME_SAMPLE_MS) {
    return;
  }

  uptimeHistory.push({ at: now, online });
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    const temporaryPath = `${UPTIME_HISTORY_PATH}.tmp`;
    fs.writeFileSync(temporaryPath, JSON.stringify({ samples: uptimeHistory }), { mode: 0o600 });
    fs.renameSync(temporaryPath, UPTIME_HISTORY_PATH);
  } catch (error) {
    console.warn("Could not persist Lavalink uptime history:", error.message);
  }
}

function uptime24Hours() {
  const now = Date.now();
  const samples = uptimeHistory.filter((entry) => entry.at >= now - UPTIME_WINDOW_MS);
  const firstSampleAt = samples[0]?.at || now;
  const coveredMs = Math.max(0, now - firstSampleAt);

  if (samples.length < 2 || coveredMs < UPTIME_WINDOW_MS) {
    return { available: false, coverageMs: coveredMs, percentage: null };
  }

  let onlineMs = 0;
  for (let index = 0; index < samples.length; index += 1) {
    const current = samples[index];
    const nextAt = samples[index + 1]?.at || now;
    if (current.online) {
      onlineMs += Math.max(0, nextAt - current.at);
    }
  }

  return {
    available: true,
    coverageMs: coveredMs,
    percentage: Math.min(100, Math.max(0, (onlineMs / coveredMs) * 100))
  };
}

function linuxNetworkBytes() {
  if (process.platform !== "linux") {
    return null;
  }

  try {
    return fs.readFileSync("/proc/net/dev", "utf8")
      .split("\n")
      .slice(2)
      .reduce((total, line) => {
        const [interfaceName, values] = line.trim().split(":");
        if (!interfaceName || !values || interfaceName.trim() === "lo") {
          return total;
        }
        const counters = values.trim().split(/\s+/).map(Number);
        return total + (Number.isFinite(counters[0]) ? counters[0] : 0) + (Number.isFinite(counters[8]) ? counters[8] : 0);
      }, 0);
  } catch {
    return null;
  }
}

function requestLavalink(route) {
  const target = new URL(route, config.lavalink.url);
  const client = target.protocol === "https:" ? https : http;

  return new Promise((resolve, reject) => {
    const request = client.request(
      target,
      {
        method: "GET",
        headers: {
          Authorization: config.lavalink.password,
          Accept: "application/json",
          "User-Agent": "takeshi-lavalink-status-dashboard/1.0"
        },
        timeout: REQUEST_TIMEOUT_MS
      },
      (response) => {
        let body = "";
        response.setEncoding("utf8");
        response.on("data", (chunk) => {
          body += chunk;
          if (body.length > 1_000_000) {
            request.destroy(new Error("Lavalink response exceeded the dashboard limit."));
          }
        });
        response.on("end", () => {
          if (response.statusCode < 200 || response.statusCode >= 300) {
            reject(new Error(`Lavalink returned HTTP ${response.statusCode}.`));
            return;
          }
          try {
            resolve(body ? JSON.parse(body) : {});
          } catch {
            reject(new Error("Lavalink returned invalid JSON."));
          }
        });
      }
    );

    request.on("timeout", () => request.destroy(new Error("Lavalink request timed out.")));
    request.on("error", reject);
    request.end();
  });
}

function normaliseNews(news) {
  return news
    .map((entry) => ({
      level: ["info", "notice", "warning"].includes(entry?.level) ? entry.level : "info",
      text: String(entry?.text || "").trim().slice(0, 500),
      buttonLabel: String(entry?.buttonLabel || "").trim().slice(0, 80),
      buttonUrl: isSafeExternalUrl(entry?.buttonUrl) ? entry.buttonUrl : null
    }))
    .filter((entry) => entry.text);
}

function publicActivity(payload) {
  const items = Array.isArray(payload?.items) ? payload.items : [];
  return items.slice(0, 50).map((item) => ({
    id: String(item?.id || ""),
    title: String(item?.title || "Unknown track").slice(0, 500),
    author: String(item?.author || "Unknown artist").slice(0, 500),
    durationMs: Math.max(0, Number(item?.durationMs) || 0),
    stream: Boolean(item?.stream),
    source: String(item?.source || "unknown").slice(0, 80),
    uri: isSafeExternalUrl(item?.uri) ? item.uri : null,
    artworkUrl: isSafeArtworkUrl(item?.artworkUrl) ? item.artworkUrl : null,
    startedAt: Math.max(0, Number(item?.startedAt) || 0),
    updatedAt: Math.max(0, Number(item?.updatedAt) || 0),
    status: ["playing", "finished", "stopped", "replaced", "failed", "stuck"].includes(item?.status)
      ? item.status
      : "finished"
  }));
}

function isSafeArtworkUrl(value) {
  return isSafeExternalUrl(value);
}

function isSafeExternalUrl(value) {
  if (typeof value !== "string" || value.length > 2048) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

function publicSourceManagers(value) {
  if (!Array.isArray(value)) return [];

  const sources = [];
  const seen = new Set();
  for (const source of value) {
    const name = String(source || "").trim().toLowerCase();
    if (!name || name === "local" || name.length > 80 || seen.has(name)) continue;
    seen.add(name);
    sources.push(name);
    if (sources.length >= 24) break;
  }
  // The dashboard lists the sources available through the installed Lavalink
  // stack as well as managers currently returned by Lavalink itself.
  for (const source of SOURCE_PRIORITY) {
    if (seen.has(source)) continue;
    seen.add(source);
    sources.push(source);
  }
  return sources.sort((left, right) => {
    const leftPriority = SOURCE_PRIORITY.indexOf(left);
    const rightPriority = SOURCE_PRIORITY.indexOf(right);
    const leftIndex = leftPriority === -1 ? SOURCE_PRIORITY.length : leftPriority;
    const rightIndex = rightPriority === -1 ? SOURCE_PRIORITY.length : rightPriority;
    return leftIndex - rightIndex || left.localeCompare(right);
  });
}

async function statusPayload() {
  const [statsResult, infoResult, activityResult] = await Promise.allSettled([
    requestLavalink("/v4/stats"),
    requestLavalink("/v4/info"),
    requestLavalink("/status/activity")
  ]);

  const stats = statsResult.status === "fulfilled" ? statsResult.value : null;
  const info = infoResult.status === "fulfilled" ? infoResult.value : null;
  const activityAvailable = activityResult.status === "fulfilled";
  const online = Boolean(stats && info);
  recordAvailability(online);

  return {
    generatedAt: Date.now(),
    refreshSeconds: config.dashboard.refreshSeconds,
    news: normaliseNews(config.dashboard.news),
    node: {
      name: config.dashboard.nodeName,
      online,
      version: typeof info?.version?.semver === "string" ? info.version.semver : null,
      sources: publicSourceManagers(info?.sourceManagers),
      players: Math.max(0, Number(stats?.players) || 0),
      playingPlayers: Math.max(0, Number(stats?.playingPlayers) || 0),
      uptimeMs: Math.max(0, Number(stats?.uptime) || 0),
      memory: {
        free: Math.max(0, Number(stats?.memory?.free) || 0),
        used: Math.max(0, Number(stats?.memory?.used) || 0),
        allocated: Math.max(0, Number(stats?.memory?.allocated) || 0),
        reservable: Math.max(0, Number(stats?.memory?.reservable) || 0)
      },
      cpu: {
        cores: Math.max(0, Number(stats?.cpu?.cores) || 0),
        systemLoad: Math.max(0, Number(stats?.cpu?.systemLoad) || 0),
        lavalinkLoad: Math.max(0, Number(stats?.cpu?.lavalinkLoad) || 0)
      },
      uptime24h: uptime24Hours(),
      networkBytes: linuxNetworkBytes()
    },
    activity: {
      available: activityAvailable,
      items: activityAvailable ? publicActivity(activityResult.value) : []
    },
    errors: {
      stats: statsResult.status === "rejected" ? "unavailable" : null,
      info: infoResult.status === "rejected" ? "unavailable" : null,
      activity: activityResult.status === "rejected" ? "plugin-unavailable" : null
    }
  };
}

function unavailableStatusPayload() {
  return {
    generatedAt: Date.now(),
    refreshSeconds: config.dashboard.refreshSeconds,
    news: normaliseNews(config.dashboard.news),
    node: {
      name: config.dashboard.nodeName,
      online: false,
      version: null,
      sources: [],
      players: 0,
      playingPlayers: 0,
      uptimeMs: 0,
      memory: { free: 0, used: 0, allocated: 0, reservable: 0 },
      cpu: { cores: 0, systemLoad: 0, lavalinkLoad: 0 },
      uptime24h: uptime24Hours(),
      networkBytes: linuxNetworkBytes()
    },
    activity: { available: false, items: [] },
    errors: { stats: "unavailable", info: "unavailable", activity: "plugin-unavailable" }
  };
}

function sendStatusEvent(response, payload) {
  response.write(`event: status\ndata: ${JSON.stringify(payload)}\n\n`);
}

function broadcastStatus(payload) {
  for (const response of statusSubscribers) {
    if (response.writableEnded || response.destroyed) {
      statusSubscribers.delete(response);
      continue;
    }
    try {
      sendStatusEvent(response, payload);
    } catch {
      statusSubscribers.delete(response);
      response.destroy();
    }
  }
}

function refreshStatusCache() {
  if (statusRefreshInFlight) return statusRefreshInFlight;

  statusRefreshInFlight = statusPayload()
    .then((payload) => {
      statusCache = payload;
      broadcastStatus(statusCache);
    })
    .catch((error) => {
      console.error("Could not refresh status cache:", error.message);
      statusCache = unavailableStatusPayload();
      broadcastStatus(statusCache);
    })
    .finally(() => {
      statusRefreshInFlight = null;
    });

  return statusRefreshInFlight;
}

function sendJson(response, statusCode, body) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff"
  });
  response.end(JSON.stringify(body));
}

function sendStatic(response, requestPath) {
  const relative = requestPath === "/" ? "index.html" : decodeURIComponent(requestPath).replace(/^\/+/, "");
  const filePath = path.resolve(PUBLIC_DIR, relative);

  if (!filePath.startsWith(`${PUBLIC_DIR}${path.sep}`) || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Not found");
    return;
  }

  response.writeHead(200, {
    "Content-Type": CONTENT_TYPES[path.extname(filePath).toLowerCase()] || "application/octet-stream",
    "Cache-Control": "public, max-age=300",
    "X-Content-Type-Options": "nosniff"
  });
  fs.createReadStream(filePath).pipe(response);
}

const server = http.createServer(async (request, response) => {
  const requestUrl = new URL(request.url || "/", "http://localhost");

  if (request.method !== "GET") {
    sendJson(response, 405, { error: "Method not allowed" });
    return;
  }

  if (requestUrl.pathname === "/healthz") {
    sendJson(response, 200, { ok: true });
    return;
  }

  if (requestUrl.pathname === "/api/status") {
    sendJson(response, statusCache.node.online ? 200 : 503, statusCache);
    return;
  }

  if (requestUrl.pathname === "/api/status/stream") {
    response.writeHead(200, {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
      "X-Content-Type-Options": "nosniff"
    });
    response.write("retry: 3000\n\n");
    statusSubscribers.add(response);
    sendStatusEvent(response, statusCache);
    request.on("close", () => statusSubscribers.delete(response));
    return;
  }

  sendStatic(response, requestUrl.pathname);
});

server.listen(config.listen.port, config.listen.host, () => {
  console.log(`Takeshi Lavalink status dashboard listening on http://${config.listen.host}:${config.listen.port}`);
});

// Lavalink is polled once for the whole dashboard. Every browser receives this
// shared snapshot through Server-Sent Events instead of triggering its own poll.
void refreshStatusCache();
setInterval(refreshStatusCache, config.dashboard.refreshSeconds * 1000).unref();
