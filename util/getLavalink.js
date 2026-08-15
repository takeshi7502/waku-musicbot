/**
 *
 * @param {import("../lib/DiscordMusicBot")} client
 * @returns {import("lavalink-client").LavalinkNode | undefined}
 */
module.exports = async (client) => {
  const connectedNodes = [...client.manager.nodeManager.nodes.values()].filter(n => n.connected);
  if (connectedNodes.length === 0) return undefined;
  return connectedNodes[Math.floor(Math.random() * connectedNodes.length)];
};
