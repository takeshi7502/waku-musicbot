"use strict";

const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const { once } = require("node:events");
const { test } = require("node:test");

async function listen(server) {
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  return server.address().port;
}

test("Vercel handler reads environment config and refreshes snapshots without background work or disk state", { timeout: 15_000 }, async (t) => {
  let nodeOnline = true;
  let pluginAvailable = true;
  let playing = true;
  let requests = 0;
  let streamRequests = 0;
  const node = http.createServer((request, response) => {
    requests += 1;
    assert.equal(request.headers.authorization, "private-test-password");
    response.setHeader("Content-Type", "application/json");
    if (!nodeOnline) return response.writeHead(503).end("{}");
    if (request.url === "/v4/info") {
      return response.end(JSON.stringify({ version: { semver: "4.2.2" }, sourceManagers: ["youtube"] }));
    }
    if (request.url === "/v4/stats") {
      return response.end(JSON.stringify({ players: 1, playingPlayers: playing ? 1 : 0 }));
    }
    if (request.url === "/status/activity") {
      if (!pluginAvailable) return response.writeHead(404).end("{}");
      return response.end(JSON.stringify({ items: [{ id: "track", title: "Test song", status: playing ? "playing" : "finished" }] }));
    }
    streamRequests += 1;
    response.writeHead(404).end("{}");
  });
  const nodePort = await listen(node);
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "lavalink-vercel-test-"));
  fs.copyFileSync(path.join(__dirname, "..", "server.js"), path.join(tempDir, "server.js"));
  fs.mkdirSync(path.join(tempDir, "public"));
  fs.writeFileSync(path.join(tempDir, "public", "index.html"), "<h1>Dashboard</h1>");
  const harness = `
    const http = require('node:http');
    const handler = require('./server.js');
    http.createServer(handler).listen(0, '127.0.0.1', function () {
      console.log(this.address().port);
    });
  `;
  const dashboard = spawn(process.execPath, ["-e", harness], {
    cwd: tempDir,
    env: {
      ...process.env,
      VERCEL: "1",
      LAVALINK_NODES: JSON.stringify([
        { id: "test", name: "Environment node", url: `http://127.0.0.1:${nodePort}`, password: "private-test-password", local: true }
      ]),
      DASHBOARD_REFRESH_SECONDS: "7",
      DASHBOARD_TIME_ZONE: "UTC",
      DASHBOARD_NEWS: JSON.stringify([{ text: "Environment notice" }])
    },
    stdio: ["ignore", "pipe", "pipe"]
  });
  let output = "";
  dashboard.stderr.on("data", (chunk) => { output += chunk; });
  t.after(async () => {
    dashboard.kill();
    if (dashboard.exitCode === null) await once(dashboard, "exit");
    node.closeAllConnections();
    await new Promise((resolve) => node.close(resolve));
    fs.rmSync(tempDir, { recursive: true, force: true });
  });
  const dashboardPort = await new Promise((resolve, reject) => {
    dashboard.stdout.once("data", (chunk) => resolve(Number(String(chunk).trim())));
    dashboard.once("exit", () => reject(new Error(output)));
  });
  const base = `http://127.0.0.1:${dashboardPort}`;
  assert.equal((await fetch(`${base}/healthz`)).status, 200);
  assert.equal(await (await fetch(base)).text(), "<h1>Dashboard</h1>");
  assert.equal(requests, 0, "Importing the handler and serving static content must not poll nodes");
  const first = await fetch(`${base}/api/status`);
  const text = await first.text();
  const payload = JSON.parse(text);
  assert.equal(first.status, 200);
  assert.equal(first.headers.get("cache-control"), "no-store");
  assert.equal(payload.transport, "polling");
  assert.equal(payload.nodes[0].online, true);
  assert.equal(payload.nodes[0].name, "Environment node");
  assert.equal(payload.nodes[0].networkBytes, null);
  assert.equal(payload.nodes[0].uptime24h.available, false);
  assert.equal(payload.refreshSeconds, 7);
  assert.equal(payload.timeZone, "UTC");
  assert.equal(payload.news[0].text, "Environment notice");
  assert.equal(payload.activity.items[0].status, "playing");
  assert.equal(text.includes("private-test-password"), false);
  assert.equal(text.includes(`127.0.0.1:${nodePort}`), false);
  playing = false;
  const second = await (await fetch(`${base}/api/status`)).json();
  assert.equal(second.nodes[0].playingPlayers, 0);
  assert.equal(second.activity.items[0].status, "finished");
  pluginAvailable = false;
  const noPlugin = await (await fetch(`${base}/api/status`)).json();
  assert.equal(noPlugin.activity.available, false);
  assert.deepEqual(noPlugin.activity.items, []);
  pluginAvailable = true;
  assert.equal((await (await fetch(`${base}/api/status`)).json()).activity.available, true);
  nodeOnline = false;
  const offline = await fetch(`${base}/api/status`);
  assert.equal(offline.status, 503);
  assert.equal((await offline.json()).nodes[0].online, false);
  assert.equal((await fetch(`${base}/api/status/stream`)).status, 404);
  assert.equal((await fetch(`${base}/api/status`, { method: "POST" })).status, 405);
  assert.equal(streamRequests, 0, "Vercel must never open activity SSE sockets");
  assert.equal(fs.existsSync(path.join(tempDir, "data")), false);
  assert.equal(fs.existsSync(path.join(tempDir, "config.json")), false);
});

test("invalid environment configuration is rejected without printing passwords", async () => {
  const { spawnSync } = require("node:child_process");
  for (const value of ["not-json", "[]", '[{"id":"a","url":"https://example.com","password":""}]']) {
    const result = spawnSync(process.execPath, ["-e", "require('./server.js')"], {
      cwd: path.join(__dirname, ".."),
      env: { ...process.env, VERCEL: "1", LAVALINK_NODES: value },
      encoding: "utf8"
    });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /LAVALINK_NODES|Configure between|password must be configured/);
  }
});
