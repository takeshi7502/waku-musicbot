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
const ACTIVITY_STREAM_RETRY_MS = 3000;
const UPTIME_WINDOW_MS = 24 * 60 * 60 * 1000;
const UPTIME_SAMPLE_MS = 60 * 1000;
const MAX_NODES = 12;
const MAX_ACTIVITY_ITEMS = 50;
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
    throw new Error(`Missing ${CONFIG_PATH}. Copy config.example.json to config.json and configure the Lavalink nodes.`);
  }

  const raw = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8").replace(/^\uFEFF/, ""));
  const host = raw.listen?.host || "127.0.0.1";
  const port = Number(raw.listen?.port || 3010);
  const dashboard = raw.dashboard || {};

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("listen.port must be a valid TCP port.");
  }

  const rawNodes = Array.isArray(raw.nodes) && raw.nodes.length
    ? raw.nodes
    : raw.lavalink
      ? [{
          id: "default",
          name: dashboard.nodeName || "Lavalink",
          url: raw.lavalink.url,
          password: raw.lavalink.password,
          local: true
        }]
      : [];

  if (!rawNodes.length || rawNodes.length > MAX_NODES) {
    throw new Error(`config.json must contain between 1 and ${MAX_NODES} nodes.`);
  }

  const seenIds = new Set();
  const nodes = rawNodes.map((entry, index) => {
    const node = parseNode(entry, index, dashboard.nodeName || "Lavalink");
    if (seenIds.has(node.id)) {
      throw new Error(`Duplicate node id: ${node.id}`);
    }
    seenIds.add(node.id);
    return node;
  });

  const timeZone = isValidTimeZone(dashboard.timeZone) ? dashboard.timeZone : "Asia/Ho_Chi_Minh";
  return {
    listen: { host, port },
    nodes,
    dashboard: {
      refreshSeconds: clamp(Number(dashboard.refreshSeconds || 5), 3, 60),
      timeZone,
      news: Array.isArray(dashboard.news) ? dashboard.news.slice(0, 8) : []
    }
  };
}

function parseNode(rawNode, index, fallbackName) {
  const value = rawNode && typeof rawNode === "object" ? rawNode : {};
  const id = String(value.id || `node-${index + 1}`).trim();
  const name = String(value.name || (index === 0 ? fallbackName : `Lavalink ${index + 1}`)).trim();
  const password = value.password;

  if (!/^[a-zA-Z0-9_-]{1,50}$/.test(id)) {
    throw new Error(`nodes[${index}].id may only contain letters, numbers, _ and -.`);
  }
  if (!name || name.length > 100) {
    throw new Error(`nodes[${index}].name must contain 1-100 characters.`);
  }
  if (typeof password !== "string" || !password || password === "REPLACE_WITH_YOUR_LAVALINK_PASSWORD") {
    throw new Error(`nodes[${index}].password must be configured.`);
  }

  let url;
  try {
    url = new URL(value.url);
  } catch {
    throw new Error(`nodes[${index}].url must be a valid http(s) URL.`);
  }
  if (!/^https?:$/.test(url.protocol) || url.username || url.password) {
    throw new Error(`nodes[${index}].url must be an http(s) URL without embedded credentials.`);
  }

  return {
    id,
    name,
    url,
    password,
    // Lavalink reports CPU/RAM remotely, but network bytes belong to the host
    // that runs the dashboard. Keep this opt-in for a truthful remote-node card.
    local: Boolean(value.local)
  };
}

function isValidTimeZone(value) {
  if (typeof value !== "string" || !value) return false;
  try {
    new Intl.DateTimeFormat("vi-VN", { timeZone: value }).format();
    return true;
  } catch {
    return false;
  }
}

function clamp(value, min, max) {
  return Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : min;
}

const config = loadConfig();
let uptimeHistory = loadUptimeHistory();
const nodeRuntime = new Map(config.nodes.map((node) => [node.id, createNodeRuntime()]));
let statusCache = unavailableStatusPayload();
let statusRefreshInFlight = null;
const statusSubscribers = new Set();

function createNodeRuntime() {
  return {
    activity: unavailableActivityPayload(),
    activityStreamRequest: null,
    activityStreamResponse: null,
    activityStreamReconnectTimer: null,
    activityStreamLive: false,
    activityPollingUnsupported: false,
    activityStreamUnsupported: false
  };
}

function loadUptimeHistory() {
  try {
    const stored = JSON.parse(fs.readFileSync(UPTIME_HISTORY_PATH, "utf8"));
    const nodes = {};
    const storedNodes = stored?.nodes && typeof stored.nodes === "object" ? stored.nodes : null;

    for (const node of config.nodes) {
      const samples = storedNodes?.[node.id]?.samples
        || (node.id === config.nodes[0].id ? stored?.samples : null)
        || [];
      nodes[node.id] = { samples: normaliseSamples(samples) };
    }
    return nodes;
  } catch {
    return Object.fromEntries(config.nodes.map((node) => [node.id, { samples: [] }]));
  }
}

function normaliseSamples(samples) {
  return Array.isArray(samples)
    ? samples.filter((entry) => Number.isFinite(entry?.at) && typeof entry?.online === "boolean")
    : [];
}

function recordAvailability(nodeId, online) {
  const now = Date.now();
  const cutoff = now - UPTIME_WINDOW_MS;
  const history = uptimeHistory[nodeId] || { samples: [] };
  uptimeHistory[nodeId] = history;
  history.samples = history.samples.filter((entry) => entry.at >= cutoff);
  const last = history.samples.at(-1);

  if (last && now - last.at < UPTIME_SAMPLE_MS) return;

  history.samples.push({ at: now, online });
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    const temporaryPath = `${UPTIME_HISTORY_PATH}.tmp`;
    fs.writeFileSync(temporaryPath, JSON.stringify({ version: 2, nodes: uptimeHistory }), { mode: 0o600 });
    fs.renameSync(temporaryPath, UPTIME_HISTORY_PATH);
  } catch (error) {
    console.warn("Could not persist Lavalink uptime history:", error.message);
  }
}

function uptime24Hours(nodeId) {
  const now = Date.now();
  const samples = (uptimeHistory[nodeId]?.samples || []).filter((entry) => entry.at >= now - UPTIME_WINDOW_MS);
  const firstSampleAt = samples[0]?.at || now;
  const coveredMs = Math.max(0, now - firstSampleAt);

  if (samples.length < 2 || coveredMs < UPTIME_WINDOW_MS) {
    return { available: false, coverageMs: coveredMs, percentage: null };
  }

  let onlineMs = 0;
  for (let index = 0; index < samples.length; index += 1) {
    const current = samples[index];
    const nextAt = samples[index + 1]?.at || now;
    if (current.online) onlineMs += Math.max(0, nextAt - current.at);
  }

  return {
    available: true,
    coverageMs: coveredMs,
    percentage: Math.min(100, Math.max(0, (onlineMs / coveredMs) * 100))
  };
}

function linuxNetworkBytes() {
  if (process.platform !== "linux") return null;

  try {
    return fs.readFileSync("/proc/net/dev", "utf8")
      .split("\n")
      .slice(2)
      .reduce((total, line) => {
        const [interfaceName, values] = line.trim().split(":");
        if (!interfaceName || !values || interfaceName.trim() === "lo") return total;
        const counters = values.trim().split(/\s+/).map(Number);
        return total
          + (Number.isFinite(counters[0]) ? counters[0] : 0)
          + (Number.isFinite(counters[8]) ? counters[8] : 0);
      }, 0);
  } catch {
    return null;
  }
}

function requestLavalink(node, route) {
  const target = new URL(route, node.url);
  const client = target.protocol === "https:" ? https : http;

  return new Promise((resolve, reject) => {
    const request = client.request(
      target,
      {
        method: "GET",
        headers: {
          Authorization: node.password,
          Accept: "application/json",
          "User-Agent": "takeshi-lavalink-status-dashboard/1.1"
        },
        timeout: REQUEST_TIMEOUT_MS
      },
      (response) => {
        let body = "";
        response.setEncoding("utf8");
        response.on("data", (chunk) => {
          body += chunk;
          if (body.length > 1_000_000) request.destroy(new Error("Lavalink response exceeded the dashboard limit."));
        });
        response.on("end", () => {
          if (response.statusCode < 200 || response.statusCode >= 300) {
            const error = new Error(`Lavalink returned HTTP ${response.statusCode}.`);
            error.statusCode = response.statusCode;
            reject(error);
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

function publicActivity(payload, node) {
  const items = Array.isArray(payload?.items) ? payload.items : [];
  return items.slice(0, MAX_ACTIVITY_ITEMS).map((item) => ({
    id: `${node.id}:${String(item?.id || "")}`,
    nodeId: node.id,
    nodeName: node.name,
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
  for (const source of SOURCE_PRIORITY) {
    if (seen.has(source)) continue;
    seen.add(source);
    sources.push(source);
  }
  return sources.sort(compareSources);
}

function compareSources(left, right) {
  const leftPriority = SOURCE_PRIORITY.indexOf(left);
  const rightPriority = SOURCE_PRIORITY.indexOf(right);
  const leftIndex = leftPriority === -1 ? SOURCE_PRIORITY.length : leftPriority;
  const rightIndex = rightPriority === -1 ? SOURCE_PRIORITY.length : rightPriority;
  return leftIndex - rightIndex || left.localeCompare(right);
}

function aggregateSources(nodes) {
  return [...new Set(nodes.flatMap((node) => node.sources || []))].sort(compareSources);
}

function unavailableActivityPayload() {
  return { available: false, items: [] };
}

function activityPayload(payload, node) {
  return { available: true, items: publicActivity(payload, node) };
}

function activitySignature(activity) {
  return JSON.stringify(activity);
}

function replaceActivityCache(runtime, nextActivity) {
  const changed = activitySignature(runtime.activity) !== activitySignature(nextActivity);
  runtime.activity = nextActivity;
  return changed;
}

function aggregateActivity() {
  const activityByNode = config.nodes.map((node) => ({ node, activity: nodeRuntime.get(node.id).activity }));
  const nodesWithPlugin = activityByNode.filter(({ activity }) => activity.available);
  const items = nodesWithPlugin
    .flatMap(({ activity }) => activity.items)
    .sort((left, right) => (right.updatedAt || right.startedAt) - (left.updatedAt || left.startedAt))
    .slice(0, MAX_ACTIVITY_ITEMS);

  return {
    available: nodesWithPlugin.length > 0,
    availableNodes: nodesWithPlugin.length,
    totalNodes: config.nodes.length,
    items
  };
}

function createNodeStatusPayload(node, statsResult, infoResult) {
  const stats = statsResult.status === "fulfilled" ? statsResult.value : null;
  const info = infoResult.status === "fulfilled" ? infoResult.value : null;
  const online = Boolean(stats && info);
  recordAvailability(node.id, online);

  return {
    id: node.id,
    name: node.name,
    online,
    version: typeof info?.version?.semver === "string" ? info.version.semver : null,
    sources: publicSourceManagers(info?.sourceManagers),
    players: Math.max(0, Number(stats?.players) || 0),
    playingPlayers: Math.max(0, Number(stats?.playingPlayers) || 0),
    uptimeMs: Math.max(0, Number(stats?.uptime) || 0),
    memory: {
      free: Math.max(0, Number(stats?.memory?.free) || 0),
      used: Math.max(0, Number(stats?.memory?.used) || 0),
      allocated: Math.max(0, Number(stats?.memory?.allocated || 0)),
      reservable: Math.max(0, Number(stats?.memory?.reservable || 0))
    },
    cpu: {
      cores: Math.max(0, Number(stats?.cpu?.cores) || 0),
      systemLoad: Math.max(0, Number(stats?.cpu?.systemLoad) || 0),
      lavalinkLoad: Math.max(0, Number(stats?.cpu?.lavalinkLoad) || 0)
    },
    uptime24h: uptime24Hours(node.id),
    networkBytes: node.local ? linuxNetworkBytes() : null
  };
}

async function nodeStatusPayload(node) {
  const runtime = nodeRuntime.get(node.id);
  const shouldPollActivity = !runtime.activityStreamLive && !runtime.activityPollingUnsupported;
  const activityRequest = shouldPollActivity
    ? requestLavalink(node, "/status/activity")
    : Promise.resolve(null);
  const [statsResult, infoResult, activityResult] = await Promise.allSettled([
    requestLavalink(node, "/v4/stats"),
    requestLavalink(node, "/v4/info"),
    activityRequest
  ]);

  if (shouldPollActivity && activityResult.status === "rejected" && activityResult.reason?.statusCode === 404) {
    runtime.activityPollingUnsupported = true;
  }

  if (shouldPollActivity && activityResult.status === "fulfilled" && activityResult.value) {
    replaceActivityCache(runtime, activityPayload(activityResult.value, node));
  }

  return createNodeStatusPayload(node, statsResult, infoResult);
}

async function statusPayload() {
  const nodes = await Promise.all(config.nodes.map(nodeStatusPayload));
  return {
    generatedAt: Date.now(),
    refreshSeconds: config.dashboard.refreshSeconds,
    timeZone: config.dashboard.timeZone,
    news: normaliseNews(config.dashboard.news),
    nodes,
    sources: aggregateSources(nodes),
    activity: aggregateActivity()
  };
}

function unavailableNodePayload(node) {
  return {
    id: node.id,
    name: node.name,
    online: false,
    version: null,
    sources: [],
    players: 0,
    playingPlayers: 0,
    uptimeMs: 0,
    memory: { free: 0, used: 0, allocated: 0, reservable: 0 },
    cpu: { cores: 0, systemLoad: 0, lavalinkLoad: 0 },
    uptime24h: uptime24Hours(node.id),
    networkBytes: null
  };
}

function unavailableStatusPayload() {
  return {
    generatedAt: Date.now(),
    refreshSeconds: config.dashboard.refreshSeconds,
    timeZone: config.dashboard.timeZone,
    news: normaliseNews(config.dashboard.news),
    nodes: config.nodes.map(unavailableNodePayload),
    sources: [],
    activity: aggregateActivity()
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

function broadcastActivityChange(node, runtime, snapshot) {
  const nextActivity = activityPayload(snapshot, node);
  if (!replaceActivityCache(runtime, nextActivity)) return;

  statusCache = {
    ...statusCache,
    generatedAt: Date.now(),
    activity: aggregateActivity()
  };
  broadcastStatus(statusCache);
}

function scheduleActivityStreamReconnect(node, runtime) {
  if (runtime.activityStreamUnsupported || runtime.activityStreamReconnectTimer) return;
  runtime.activityStreamReconnectTimer = setTimeout(() => {
    runtime.activityStreamReconnectTimer = null;
    connectActivityStream(node);
  }, ACTIVITY_STREAM_RETRY_MS);
  runtime.activityStreamReconnectTimer.unref();
}

function handleActivityStreamFrame(node, runtime, frame) {
  const lines = frame.split(/\r?\n/);
  const event = lines.find((line) => line.startsWith("event:"))?.slice(6).trim();
  const data = lines
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trimStart())
    .join("\n");

  if (event && event !== "activity") return;
  if (!data) return;

  try {
    runtime.activityStreamLive = true;
    broadcastActivityChange(node, runtime, JSON.parse(data));
  } catch (error) {
    console.warn(`Ignored an invalid activity stream message from ${node.id}:`, error.message);
  }
}

function connectActivityStream(node) {
  const runtime = nodeRuntime.get(node.id);
  if (runtime.activityStreamUnsupported || runtime.activityStreamRequest || runtime.activityStreamResponse || runtime.activityStreamReconnectTimer) return;

  const target = new URL("/status/activity/stream", node.url);
  const client = target.protocol === "https:" ? https : http;
  let closed = false;
  let streamBuffer = "";
  let response = null;

  const closeAndRetry = (reason, retry = true) => {
    if (closed) return;
    closed = true;
    runtime.activityStreamLive = false;
    if (runtime.activityStreamRequest === request) runtime.activityStreamRequest = null;
    if (runtime.activityStreamResponse === response) runtime.activityStreamResponse = null;
    if (reason) console.warn(`Activity stream ${node.id} closed: ${reason}`);
    if (retry) scheduleActivityStreamReconnect(node, runtime);
  };

  const request = client.request(
    target,
    {
      method: "GET",
      headers: {
        Authorization: node.password,
        Accept: "text/event-stream",
        "User-Agent": "takeshi-lavalink-status-dashboard/1.1"
      }
    },
    (incoming) => {
      response = incoming;
      if (incoming.statusCode < 200 || incoming.statusCode >= 300) {
        incoming.resume();
        if (incoming.statusCode === 404) {
          runtime.activityStreamUnsupported = true;
          closeAndRetry(null, false);
          return;
        }
        closeAndRetry(`Lavalink returned HTTP ${incoming.statusCode}.`);
        return;
      }

      runtime.activityStreamRequest = null;
      runtime.activityStreamResponse = incoming;
      incoming.setEncoding("utf8");
      incoming.on("data", (chunk) => {
        streamBuffer += chunk;
        let boundary = streamBuffer.search(/\r?\n\r?\n/);
        while (boundary !== -1) {
          const frame = streamBuffer.slice(0, boundary);
          streamBuffer = streamBuffer.slice(boundary).replace(/^\r?\n\r?\n/, "");
          handleActivityStreamFrame(node, runtime, frame);
          boundary = streamBuffer.search(/\r?\n\r?\n/);
        }
      });
      incoming.on("error", (error) => closeAndRetry(error.message));
      incoming.on("end", () => closeAndRetry("connection ended."));
      incoming.on("close", () => closeAndRetry("connection closed."));
    }
  );

  runtime.activityStreamRequest = request;
  request.on("error", (error) => closeAndRetry(error.message));
  request.end();
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

const server = http.createServer((request, response) => {
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
    sendJson(response, statusCache.nodes.some((node) => node.online) ? 200 : 503, statusCache);
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

void refreshStatusCache();
for (const node of config.nodes) connectActivityStream(node);
setInterval(refreshStatusCache, config.dashboard.refreshSeconds * 1000).unref();
