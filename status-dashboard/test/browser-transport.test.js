"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { test } = require("node:test");

function browser(fetchResponse) {
  const source = fs.readFileSync(path.join(__dirname, "..", "public", "app.js"), "utf8");
  const timers = new Map();
  const streams = [];
  const rendered = [];
  const listeners = new Map();
  const elements = new Map();
  let timerId = 0;
  let fetchCount = 0;
  const context = vm.createContext({
    document: {
      querySelector(selector) {
        if (!elements.has(selector)) elements.set(selector, { textContent: "" });
        return elements.get(selector);
      }
    },
    window: {
      addEventListener(event, callback) {
        listeners.set(event, [...(listeners.get(event) || []), callback]);
      }
    },
    AbortController,
    setTimeout(callback, delay) {
      const id = ++timerId;
      timers.set(id, { callback, delay });
      return id;
    },
    clearTimeout(id) { timers.delete(id); },
    EventSource: class {
      constructor(url) { this.url = url; streams.push(this); }
      addEventListener() {}
      close() { this.closed = true; }
    },
    async fetch(url, options) {
      fetchCount += 1;
      assert.equal(url, "/api/status");
      assert.equal(options.cache, "no-store");
      return fetchResponse();
    },
    rendered
  });
  const ready = vm.runInContext(source.replace("void startStatusUpdates();", "render = (payload) => rendered.push(payload); startStatusUpdates();"), context);
  return { ready, timers, streams, rendered, listeners, elements, fetchCount: () => fetchCount };
}

test("Vercel browser polls after an offline 503, serially and at the configured interval", async () => {
  const fixture = browser(() => ({
    ok: false,
    status: 503,
    async json() { return { nodes: [{ online: false }], transport: "polling", refreshSeconds: 7 }; }
  }));
  await fixture.ready;
  assert.equal(fixture.rendered.length, 1);
  assert.equal(fixture.streams.length, 0);
  assert.equal(fixture.timers.size, 1, "The completed request timeout must be cleared");
  const [id, timer] = [...fixture.timers][0];
  assert.equal(timer.delay, 7000);
  fixture.timers.delete(id);
  await timer.callback();
  assert.equal(fixture.fetchCount(), 2);
  assert.equal(fixture.rendered.length, 2);
  for (const listener of fixture.listeners.get("beforeunload")) listener();
  assert.equal(fixture.timers.size, 0);
});

test("VPS browser retains SSE instead of starting a polling loop", async () => {
  const fixture = browser(() => ({
    ok: true,
    async json() { return { nodes: [], transport: "sse" }; }
  }));
  await fixture.ready;
  assert.equal(fixture.rendered.length, 1);
  assert.equal(fixture.streams[0].url, "/api/status/stream");
  assert.equal(fixture.timers.size, 0);
  for (const listener of fixture.listeners.get("beforeunload")) listener();
  assert.equal(fixture.streams[0].closed, true);
});

test("browser retries network or malformed API errors instead of silently freezing", async () => {
  const fixture = browser(() => { throw new Error("Network down"); });
  await fixture.ready;
  assert.equal(fixture.rendered.length, 0);
  assert.equal(fixture.streams.length, 0);
  assert.equal([...fixture.timers.values()][0].delay, 5000);
  assert.match(fixture.elements.get("#last-update").textContent, /đang thử lại/);
});
