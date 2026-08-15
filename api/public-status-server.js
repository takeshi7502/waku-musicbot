const http = require("http");
const { URL } = require("url");
const moment = require("moment");
require("moment-duration-format");

function setCorsHeaders(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function sendJson(res, statusCode, data) {
  setCorsHeaders(res);
  res.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(data));
}

function formatRuntime(ms) {
  if (!Number.isFinite(ms) || ms < 0) return "0s";
  return moment.duration(ms).format("D[d]・H[h]・m[m]・s[s]", { trim: "all" });
}

const ACTIVITY_LABELS = {
  0: "Đang chơi",
  1: "Đang phát trực tiếp",
  2: "Đang nghe",
  3: "Đang xem",
  4: "",
  5: "Đang thi đấu",
};

function getActivityText(activity) {
  if (!activity) return null;

  if (activity.type === 4 || activity.name === "Custom Status") {
    return activity.state || activity.name || null;
  }

  const label = ACTIVITY_LABELS[activity.type] || "Đang hoạt động";
  const content = activity.state || activity.details || activity.name;
  return content ? `${label} ${content}` : label;
}

function getCustomStatus(client) {
  const activities = client.presence?.activities || [];
  const custom = activities.find(activity => activity.type === 4 || activity.name === "Custom Status");
  if (custom) return getActivityText(custom);

  return getActivityText(activities[0]);
}

function getLavalinkNodes(client) {
  const nodes = client.manager?.nodeManager?.nodes;
  if (!nodes) return [];

  return [...nodes.values()].map((node, index) => ({
    id: node.id || `Node ${index + 1}`,
    label: `Node ${index + 1}`,
    online: Boolean(node.connected),
  }));
}

function getInviteUrl(client) {
  return `https://discord.com/oauth2/authorize?client_id=${client.config.clientId}&permissions=${client.config.permissions}&scope=bot%20applications.commands`;
}

async function getPublicStatus(client) {
  const user = client.user;

  if (!user) {
    return {
      statusCode: 503,
      body: {
        ok: false,
        status: "starting",
        updatedAt: new Date().toISOString(),
        message: "Bot user is not ready yet.",
      },
    };
  }

  await user.fetch(true).catch(() => null);

  const allPlayers = client.manager?.players ? [...client.manager.players.values()] : [];
  const playingRooms = allPlayers.filter(player => player.playing && !player.paused).length;
  const lavalinkNodes = getLavalinkNodes(client);

  return {
    statusCode: 200,
    body: {
      ok: true,
      updatedAt: new Date().toISOString(),
      bot: {
        id: user.id,
        name: user.username,
        tag: user.discriminator && user.discriminator !== "0" ? `${user.username}#${user.discriminator}` : user.username,
        avatar: user.displayAvatarURL({ size: 256, extension: "png" }),
        banner: user.bannerURL ? user.bannerURL({ size: 1024, extension: "png" }) : null,
        status: client.presence?.status || "online",
        customStatus: getCustomStatus(client),
        inviteUrl: getInviteUrl(client),
      },
      music: {
        ping: client.ws?.ping ?? null,
        servers: client.guilds?.cache?.size ?? 0,
        playingRooms,
        connectedRooms: allPlayers.length,
        runtime: formatRuntime(client.uptime || 0),
      },
      lavalink: {
        nodes: lavalinkNodes,
        onlineCount: lavalinkNodes.filter(node => node.online).length,
        total: lavalinkNodes.length,
      },
    },
  };
}

function startPublicStatusApi(client) {
  const port = Number(process.env.PUBLIC_STATUS_PORT || process.env.PORT || client.config?.publicStatusPort || 3000);

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);

    if (req.method === "OPTIONS") {
      setCorsHeaders(res);
      res.writeHead(204);
      return res.end();
    }

    if (req.method !== "GET" || url.pathname !== "/api/public-status") {
      return sendJson(res, 404, { ok: false, message: "Not found" });
    }

    try {
      const payload = await getPublicStatus(client);
      return sendJson(res, payload.statusCode, payload.body);
    } catch (error) {
      return sendJson(res, 500, {
        ok: false,
        status: "error",
        updatedAt: new Date().toISOString(),
        message: error.message || "Public status API error",
      });
    }
  });

  server.listen(port, () => {
    console.log(`[PUBLIC STATUS API] Listening on port: ${port}`);
  });

  server.on("error", error => {
    console.error("[PUBLIC STATUS API] Failed to start:", error.message);
  });

  return server;
}

module.exports = startPublicStatusApi;
