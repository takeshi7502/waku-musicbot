"use strict";

const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const { once } = require("node:events");
const { test } = require("node:test");

const DASHBOARD_SOURCE = path.join(__dirname, "..", "server.js");

async function listen(server) {
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  return server.address().port;
}

async function freePort() {
  const server = http.createServer();
  const port = await listen(server);
  await new Promise((resolve) => server.close(resolve));
  return port;
}

async function waitFor(check, label, timeoutMs = 15_000) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const value = await check();
      if (value) return value;
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out waiting for ${label}${lastError ? `: ${lastError.message}` : ""}`);
}

test("recovers from a temporary 404 and reconciles a silent activity stream", { timeout: 30_000 }, async (t) => {
  let pluginAvailable = false;
  let trackStatus = "playing";
  let streamConnections = 0;
  const openStreams = new Set();
  const nodeServer = http.createServer((request, response) => {
    if (request.headers.authorization !== "test-password") {
      response.writeHead(401).end();
      return;
    }

    const activity = {
      items: [{
        id: "track-1",
        title: "Test song",
        author: "Test artist",
        durationMs: 180_000,
        startedAt: 1,
        updatedAt: trackStatus === "playing" ? 1 : 2,
        status: trackStatus
      }]
    };
    if (request.url === "/v4/stats") {
      response.setHeader("Content-Type", "application/json");
      response.end(JSON.stringify({ players: 1, playingPlayers: trackStatus === "playing" ? 1 : 0 }));
    } else if (request.url === "/v4/info") {
      response.setHeader("Content-Type", "application/json");
      response.end(JSON.stringify({ version: { semver: "4.2.2" }, sourceManagers: [] }));
    } else if (request.url === "/status/activity" || request.url === "/status/activity/stream") {
      if (!pluginAvailable) {
        response.writeHead(404).end();
        return;
      }
      if (request.url === "/status/activity") {
        response.setHeader("Content-Type", "application/json");
        response.end(JSON.stringify(activity));
      } else {
        streamConnections += 1;
        response.writeHead(200, { "Content-Type": "text/event-stream" });
        response.write(`event: activity\ndata: ${JSON.stringify(activity)}\n\n`);
        openStreams.add(response);
        response.on("close", () => openStreams.delete(response));
        // Intentionally never send another frame: the TCP connection remains
        // open even after the plugin's snapshot changes.
      }
    } else {
      response.writeHead(404).end();
    }
  });

  const nodePort = await listen(nodeServer);

  const dashboardPort = await freePort();
  const temporaryDir = fs.mkdtempSync(path.join(os.tmpdir(), "lavalink-dashboard-test-"));
  const source = fs.readFileSync(DASHBOARD_SOURCE, "utf8");
  assert.ok(source.includes("const ACTIVITY_RECONCILE_MS = 30 * 1000;"));
  assert.ok(source.includes("const ACTIVITY_UNAVAILABLE_RETRY_MS = 60 * 1000;"));
  fs.writeFileSync(path.join(temporaryDir, "server.js"), source
    .replace("const ACTIVITY_RECONCILE_MS = 30 * 1000;", "const ACTIVITY_RECONCILE_MS = 1000;")
    .replace("const ACTIVITY_UNAVAILABLE_RETRY_MS = 60 * 1000;", "const ACTIVITY_UNAVAILABLE_RETRY_MS = 1000;"));
  fs.writeFileSync(path.join(temporaryDir, "config.json"), JSON.stringify({
    listen: { host: "127.0.0.1", port: dashboardPort },
    nodes: [{ id: "aka", name: "Aka", url: `http://127.0.0.1:${nodePort}`, password: "test-password" }],
    dashboard: { refreshSeconds: 3 }
  }));

  const dashboard = spawn(process.execPath, [path.join(temporaryDir, "server.js")], {
    cwd: temporaryDir,
    stdio: ["ignore", "pipe", "pipe"]
  });
  let output = "";
  dashboard.stdout.on("data", (chunk) => { output += chunk; });
  dashboard.stderr.on("data", (chunk) => { output += chunk; });
  t.after(async () => {
    dashboard.kill();
    if (dashboard.exitCode === null) await once(dashboard, "exit");
    for (const response of openStreams) response.destroy();
    nodeServer.closeAllConnections();
    await new Promise((resolve) => nodeServer.close(resolve));
    fs.rmSync(temporaryDir, { recursive: true, force: true });
  });

  const statusUrl = `http://127.0.0.1:${dashboardPort}/api/status`;
  const getStatus = async () => {
    const response = await fetch(statusUrl);
    return response.json();
  };

  await waitFor(async () => (await getStatus()).nodes[0].online, "dashboard startup");
  pluginAvailable = true;
  await waitFor(async () => {
    const status = await getStatus();
    return status.activity.availableNodes === 1
      && status.activity.items.some((item) => item.nodeId === "aka" && item.status === "playing");
  }, "plugin recovery after 404");
  await waitFor(() => streamConnections > 0, "activity stream connection");

  trackStatus = "finished";
  await waitFor(async () => {
    const status = await getStatus();
    return status.nodes[0].playingPlayers === 0
      && status.activity.items.some((item) => item.nodeId === "aka" && item.status === "finished");
  }, "snapshot reconciliation");
  await waitFor(() => streamConnections > 1, "stream reconnect after divergence");
  assert.equal(dashboard.exitCode, null, output);
});
