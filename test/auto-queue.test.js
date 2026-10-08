const assert = require("node:assert/strict");
const test = require("node:test");
const { LavalinkNode } = require("lavalink-client");
const { createAutoPlayFunction, getYoutubeId } = require("../util/autoQueue");

const seedId = "dQw4w9WgXcQ";
const track = (
  identifier,
  sourceName = "youtube",
  title = identifier,
  author = "Artist"
) => ({
  info: { identifier, sourceName, title, author },
});
const seed = track(seedId, "youtube", "Play the game");
const spotify = track("3C3zJVJYD94h72n0bVgS4b", "spotify", "Play the game");
const next = track("00000000001");
const mix = `https://www.youtube.com/watch?v=${seedId}&list=RD${seedId}`;

function harness(responses = [], history = []) {
  const calls = { searches: [], added: [], played: [], warnings: [] };
  const data = new Map([
    ["autoQueue", true],
    ["requester", { id: "requester" }],
  ]);
  const player = {
    playing: false,
    paused: false,
    repeatMode: "off",
    get: (key) => data.get(key),
    getData: (key) => data.get(key),
    setData: (key, value) => data.set(key, value),
    queue: {
      current: null,
      tracks: [],
      previous: [],
      options: { maxPreviousTracks: 100 },
      utils: { save: async () => {} },
      async add(tracks) {
        calls.added.push(...tracks);
        this.tracks.push(...tracks);
      },
    },
    async search(input, requester) {
      calls.searches.push({ ...input, requester });
      const response = responses.shift();
      if (typeof response === "function") return response();
      if (response instanceof Error) throw response;
      return response || { tracks: [] };
    },
    async play(options) {
      calls.played.push({ current: this.queue.current, options });
      this.playing = true;
    },
  };
  const autoplay = createAutoPlayFunction({
    playedTracks: history,
    warn: (message) => calls.warnings.push(message),
  });
  return { player, calls, data, autoplay };
}

test("only real YouTube identifiers/URLs can seed a mix", () => {
  assert.equal(getYoutubeId(seed), seedId);
  assert.equal(getYoutubeId(spotify), null);
  assert.equal(getYoutubeId(track(seedId, "spotify")), null);
  assert.equal(getYoutubeId(track("short", "youtube")), null);
  assert.equal(
    getYoutubeId({ info: { uri: `https://youtu.be/${seedId}` } }),
    seedId
  );
  assert.equal(
    getYoutubeId({
      info: { uri: `https://www.youtube.com/watch?v=${seedId}` },
    }),
    seedId
  );
  assert.equal(
    getYoutubeId({
      info: { uri: `https://youtube.com.evil.invalid/watch?v=${seedId}` },
    }),
    null
  );
});

test("YouTube tracks use their mix directly and preserve requester", async () => {
  const h = harness([{ tracks: [seed, next] }]);
  await h.autoplay(h.player, seed);
  assert.deepEqual(
    h.calls.searches.map((x) => x.query),
    [mix]
  );
  assert.equal(h.calls.searches[0].source, "youtube");
  assert.equal(h.calls.searches[0].requester, h.data.get("requester"));
  assert.deepEqual(h.calls.added, [next]);
  assert.equal(h.calls.played.length, 0);
});

for (const source of ["spotify", "soundcloud", "applemusic"]) {
  test(`${source} resolves metadata to YouTube before requesting a mix`, async () => {
    const original = track(spotify.info.identifier, source, "Play the game");
    const h = harness([{ tracks: [seed] }, { tracks: [seed, next] }]);
    await h.autoplay(h.player, original);
    assert.deepEqual(
      h.calls.searches.map((x) => x.query),
      ["ytsearch:Play the game Artist", mix]
    );
    assert.ok(
      h.calls.searches.every((x) => !x.query.includes(original.info.identifier))
    );
    assert.deepEqual(h.calls.added, [next]);
  });
}

test("unresolved Spotify metadata never generates a mix with a Spotify ID", async () => {
  const h = harness([{ tracks: [spotify] }]);
  await h.autoplay(h.player, spotify);
  assert.equal(h.calls.searches.length, 1);
  assert.equal(h.calls.added.length, 0);
});

test("failed mix uses metadata search results without replaying seed", async () => {
  const h = harness([{ tracks: [seed, next] }, new Error("Mix unavailable")]);
  await h.autoplay(h.player, spotify);
  assert.deepEqual(h.calls.added, [next]);
  assert.equal(h.calls.searches.length, 2);
  assert.equal(h.calls.warnings.length, 1);
});

test("empty/filtered YouTube mix falls back to metadata search", async () => {
  const h = harness([{ tracks: [seed] }, { tracks: [seed, next] }]);
  await h.autoplay(h.player, seed);
  assert.deepEqual(h.calls.added, [next]);
  assert.equal(h.calls.searches[1].query, "ytsearch:Play the game Artist");
});

test("filters seed, same song, duplicates, malformed and already played tracks; caps at five", async () => {
  const others = Array.from({ length: 8 }, (_, index) =>
    track(String(index + 2).padStart(11, "0"))
  );
  const sameSong = track(
    "99999999999",
    "youtube",
    "  PLAY  THE GAME ",
    " artist "
  );
  const h = harness(
    [{ tracks: [null, {}, spotify, seed, sameSong, next, next, ...others] }],
    [others[0].info.identifier]
  );
  await h.autoplay(h.player, seed);
  assert.deepEqual(h.calls.added, [next, ...others.slice(1, 5)]);
});

test("disabled/missing/occupied/paused players do not search", async () => {
  const h = harness();
  h.data.set("autoQueue", false);
  await h.autoplay(h.player, seed);
  h.data.set("autoQueue", true);
  await h.autoplay(h.player, null);
  h.player.queue.tracks.push(next);
  await h.autoplay(h.player, seed);
  h.player.queue.tracks.length = 0;
  h.player.queue.current = next;
  await h.autoplay(h.player, seed);
  h.player.queue.current = null;
  h.player.paused = true;
  await h.autoplay(h.player, seed);
  assert.equal(h.calls.searches.length, 0);
});

for (const mutation of ["off", "queued", "playing", "destroyed"]) {
  test(`does not add stale results if player becomes ${mutation} during search`, async () => {
    const h = harness([
      () => {
        if (mutation === "off") h.data.set("autoQueue", false);
        if (mutation === "queued") h.player.queue.tracks.push(next);
        if (mutation === "playing") {
          h.player.playing = true;
          h.player.queue.current = next;
        }
        if (mutation === "destroyed") h.player.destroyed = true;
        return { tracks: [next] };
      },
    ]);
    await h.autoplay(h.player, seed);
    assert.equal(h.calls.added.length, 0);
  });
}

test("concurrent callbacks add recommendations only once", async () => {
  let resolve;
  const h = harness([
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  ]);
  const first = h.autoplay(h.player, seed);
  await h.autoplay(h.player, seed);
  resolve({ tracks: [next] });
  await first;
  assert.equal(h.calls.searches.length, 1);
  assert.deepEqual(h.calls.added, [next]);
});

test("API error-shaped/failed searches do not throw or loop", async () => {
  const h = harness([
    { loadType: "error", exception: { message: "Unavailable" } },
  ]);
  await h.autoplay(h.player, spotify);
  assert.equal(h.calls.added.length, 0);
  // The pending lock must be released after failure.
  await h.autoplay(h.player, spotify);
  assert.equal(h.calls.searches.length, 2);
});

test("real lavalink-client queueEnd starts first recommendation exactly once", async () => {
  const h = harness([{ tracks: [seed, next, track("00000000002")] }]);
  const manager = {
    options: {
      autoSkip: true,
      playerOptions: {
        minAutoPlayMs: 10000,
        onEmptyQueue: { autoPlayFunction: h.autoplay },
      },
    },
    utils: { isUnresolvedTrack: () => false },
    emit() {},
  };
  h.player.LavalinkManager = manager;
  h.player.node = { _LManager: manager };
  const node = { _LManager: manager, _emitDebugEvent() {} };
  await LavalinkNode.prototype.queueEnd.call(node, h.player, seed, {
    type: "TrackEndEvent",
    reason: "finished",
  });
  assert.equal(h.calls.played.length, 1);
  assert.equal(h.calls.played[0].current, next);
  assert.deepEqual(h.player.queue.tracks, [track("00000000002")]);
});
