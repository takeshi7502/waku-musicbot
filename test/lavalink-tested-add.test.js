const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");
const discord = require("discord.js");
const Collector = require("../node_modules/discord.js/src/structures/interfaces/Collector.js");

const source = fs.readFileSync(
  path.join(__dirname, "../commands/slash/lavalink.js"),
  "utf8"
);
const input = {
  host: "tested-node.invalid",
  port: 3333,
  password: "test-password",
  secure: false,
};
const plain = (value) => JSON.parse(JSON.stringify(value));

function createHarness({
  savedNodes = [{ id: "node0", host: "original.invalid", port: 3333 }],
  databaseError = null,
  fetchReplyError = false,
  acknowledgeError = false,
} = {}) {
  const calls = {
    acknowledged: 0,
    saved: [],
    requests: [],
    replies: [],
    buttonEdits: [],
    submissionEdits: [],
    mainEdits: [],
  };
  let collector;
  let responseStatus = 200;
  const submission = {
    user: { id: "admin" },
    editReply: async (payload) => calls.submissionEdits.push(payload),
    fetchReply: async () => {
      if (fetchReplyError) throw new Error("Message unavailable");
      return {
        createMessageComponentCollector(options) {
          // Use Discord.js's real synchronous stop()/end implementation.
          collector = new Collector({}, options);
          return collector;
        },
      };
    },
  };
  const mainInteraction = {
    editReply: async (payload) => calls.mainEdits.push(payload),
  };
  const client = {
    config: { embedColor: "#485e8d", nodes: plain(savedNodes) },
    lavalinkNotified: new Set(),
    async saveLavalinkNodes(nodes) {
      if (databaseError) throw databaseError;
      calls.saved.push(plain(nodes));
      this.config.nodes = plain(nodes);
    },
    manager: {
      options: {},
      nodeManager: {
        nodes: new Map(
          savedNodes.map((node) => [node.id, { connected: true }])
        ),
        createNode(node) {
          this.nodes.set(node.id, { ...node, connected: true });
        },
        connectAll: async () => [],
      },
    },
  };
  const sandbox = vm.createContext({
    module: { exports: {} },
    __dirname: path.join(__dirname, "../commands/slash"),
    require(name) {
      if (name === "discord.js") return discord;
      if (name === "../../lib/SlashCommand") {
        return class {
          setName() {
            return this;
          }
          setDescription() {
            return this;
          }
          setAdminOnly() {
            return this;
          }
          setRun(callback) {
            this.run = callback;
            return this;
          }
        };
      }
      if (name === "../../util/i18n") {
        return {
          t: (key, values) =>
            `${key}${values ? ` ${JSON.stringify(values)}` : ""}`,
        };
      }
      if (name === "../../util/playerRecovery") return {};
      if (["fs", "path", "crypto"].includes(name)) return require(name);
      throw new Error(`Unexpected dependency: ${name}`);
    },
    AbortController,
    setTimeout,
    clearTimeout,
    fetch: async (url) => {
      calls.requests.push(url);
      return {
        ok: responseStatus === 200,
        status: responseStatus,
        json: async () => ({
          version: { semver: "test" },
          sourceManagers: ["youtube"],
        }),
      };
    },
  });
  vm.runInContext(
    `${source}\nmodule.exports = { testedNodeSessions, testNode, offerTestedNodeAdd };`,
    sandbox
  );
  const api = sandbox.module.exports;

  async function offer() {
    const result = await api.testNode(client, input, async () => {});
    assert.equal(result.success, true);
    await api.offerTestedNodeAdd(client, submission, input, mainInteraction);
    return [...api.testedNodeSessions.keys()][0];
  }

  function makeButton(token, overrides = {}) {
    return {
      user: { id: "admin" },
      customId: `lava:add-tested:${token}`,
      reply: async (payload) => calls.replies.push(payload),
      editReply: async (payload) => calls.buttonEdits.push(payload),
      async deferUpdate() {
        calls.acknowledged += 1;
        if (acknowledgeError) throw new Error("Interaction unavailable");
      },
      ...overrides,
    };
  }

  return {
    api,
    client,
    calls,
    sandbox,
    offer,
    makeButton,
    collector: () => collector,
    collect: (button) => collector.listeners("collect")[0](button),
    setResponseStatus: (status) => {
      responseStatus = status;
    },
  };
}

test("Test -> Add acknowledges, persists the node and updates the main menu", async () => {
  const h = createHarness();
  const token = await h.offer();
  const button = h.makeButton(token);
  assert.equal(h.collector().filter(button), true);
  await h.collect(button);
  assert.equal(h.calls.acknowledged, 1);
  assert.equal(h.calls.saved.length, 1);
  assert.equal(h.client.config.nodes[1].id, "node1");
  assert.equal(h.client.config.nodes[1].host, input.host);
  assert.equal(h.client.config.nodes[1].authorization, input.password);
  assert.equal(h.client.config.nodes[1].enabled, true);
  assert.equal(h.api.testedNodeSessions.size, 0);
  assert.equal(h.collector().ended, true);
  assert.equal(h.calls.mainEdits.length, 1);
  assert.match(
    h.calls.buttonEdits.at(-1).embeds[0].data.description,
    /lavalink.nodeAdded/
  );
  assert.equal(h.calls.buttonEdits.at(-1).embeds[0].data.timestamp, undefined);
  assert.deepEqual(plain(h.calls.buttonEdits.at(-1).components), []);
  const buttons = h.calls.mainEdits[0].components.flatMap(
    (row) => row.components
  );
  assert.ok(
    buttons.some((item) => item.data.custom_id === "lava:toggle:node1")
  );
});

test("two in-flight clicks cannot add the same node twice", async () => {
  const h = createHarness();
  const token = await h.offer();
  let release;
  const acknowledgement = new Promise((resolve) => {
    release = resolve;
  });
  const first = h.collect(
    h.makeButton(token, { deferUpdate: () => acknowledgement })
  );
  assert.equal(h.api.testedNodeSessions.size, 0);
  await h.collect(h.makeButton(token));
  assert.match(
    h.calls.replies[0].embeds[0].data.description,
    /lavalink.testResultExpired/
  );
  release();
  await first;
  assert.equal(h.calls.saved.length, 1);
});

test("another user cannot use the tested-node Add button", async () => {
  const h = createHarness();
  const token = await h.offer();
  assert.equal(
    h.collector().filter(h.makeButton(token, { user: { id: "other" } })),
    false
  );
  assert.equal(h.api.testedNodeSessions.size, 1);
  assert.equal(h.calls.saved.length, 0);
  h.collector().stop("test-cleanup");
});

test("a missing session receives an explicit expiry message", async () => {
  const h = createHarness();
  const token = await h.offer();
  h.api.testedNodeSessions.delete(token);
  await h.collect(h.makeButton(token));
  assert.match(
    h.calls.replies[0].embeds[0].data.description,
    /lavalink.testResultExpired/
  );
  assert.equal(h.calls.replies[0].ephemeral, true);
  assert.equal(h.calls.saved.length, 0);
  h.collector().stop("test-cleanup");
});

test("timeout cleans up the session and removes the Add button", async () => {
  const h = createHarness();
  await h.offer();
  h.collector().stop("time");
  assert.equal(h.api.testedNodeSessions.size, 0);
  assert.deepEqual(plain(h.calls.submissionEdits.at(-1).components), []);
  assert.equal(h.calls.saved.length, 0);
});

test("a node that became unavailable is not saved", async () => {
  const h = createHarness();
  const token = await h.offer();
  h.setResponseStatus(503);
  await h.collect(h.makeButton(token));
  assert.equal(h.calls.acknowledged, 1);
  assert.equal(h.calls.saved.length, 0);
  assert.match(
    h.calls.buttonEdits.at(-1).embeds[0].data.description,
    /lavalink.cannotConnectAdd/
  );
});

test("an already configured node is not added again", async () => {
  const h = createHarness({ savedNodes: [{ ...input, id: "node0" }] });
  const token = await h.offer();
  await h.collect(h.makeButton(token));
  assert.equal(h.calls.saved.length, 0);
  assert.match(
    h.calls.buttonEdits.at(-1).embeds[0].data.description,
    /lavalink.nodeExists/
  );
});

test("database errors are displayed without silently failing the button", async () => {
  const h = createHarness({ databaseError: new Error("Database unavailable") });
  const token = await h.offer();
  await h.collect(h.makeButton(token));
  assert.equal(h.calls.acknowledged, 1);
  assert.equal(h.calls.saved.length, 0);
  assert.match(
    h.calls.buttonEdits.at(-1).embeds[0].data.description,
    /Database unavailable/
  );
  assert.equal(h.client.config.nodes.length, 1);
});

test("failed acknowledgement does not mutate the database", async () => {
  const h = createHarness({ acknowledgeError: true });
  const token = await h.offer();
  await h.collect(h.makeButton(token));
  assert.equal(h.calls.saved.length, 0);
  assert.equal(h.api.testedNodeSessions.size, 0);
  assert.deepEqual(plain(h.calls.submissionEdits.at(-1).components), []);
});

test("failure to fetch the result message leaves no saved session", async () => {
  const h = createHarness({ fetchReplyError: true });
  await h.offer();
  assert.equal(h.api.testedNodeSessions.size, 0);
  assert.equal(h.collector(), undefined);
});

test("unexpected Add errors are caught and displayed", async () => {
  const h = createHarness();
  const token = await h.offer();
  h.sandbox.addNode = async () => {
    throw new Error("Unexpected Add failure");
  };
  await h.collect(h.makeButton(token));
  assert.match(
    h.calls.buttonEdits.at(-1).embeds[0].data.description,
    /Unexpected Add failure/
  );
  assert.equal(h.calls.mainEdits.length, 1);
});
