const { Router } = require("express");
const moment = require("moment");
require("moment-duration-format");

const { getClient } = require("../../");

const api = Router();

function setCorsHeaders(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function formatRuntime(ms) {
  if (!Number.isFinite(ms) || ms < 0) return "0s";
  return moment.duration(ms).format("D[d]・H[h]・m[m]・s[s]", { trim: "all" });
}

function getCustomStatus(client) {
  const activities = client.presence?.activities || [];
  const custom = activities.find(activity => activity.type === 4 || activity.name === "Custom Status");
  if (!custom) return null;
  return custom.state || custom.name || null;
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

api.options("/", (_req, res) => {
  setCorsHeaders(res);
  res.sendStatus(204);
});

api.get("/", async (_req, res) => {
  setCorsHeaders(res);

  const client = getClient();
  const user = client.user;

  if (!user) {
    return res.status(503).json({
      ok: false,
      status: "starting",
      updatedAt: new Date().toISOString(),
      message: "Bot user is not ready yet.",
    });
  }

  try {
    await user.fetch(true).catch(() => null);
  } catch (_error) {}

  const allPlayers = client.manager?.players ? [...client.manager.players.values()] : [];
  const playingRooms = allPlayers.filter(player => player.playing && !player.paused).length;
  const lavalinkNodes = getLavalinkNodes(client);

  return res.json({
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
  });
});

module.exports = api;
