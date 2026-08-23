/**
 *
 * @param {import("../lib/DiscordMusicBot")} client
 * @returns {import("lavalink-client").LavalinkNode | undefined}
 */
function isNodeEnabled(client, node) {
  const configuredNode = (client.config.nodes || []).find(configNode => configNode.id === node.id);
  return configuredNode?.enabled !== false;
}

const getLavalink = async client => {
  const connectedNodes = [...client.manager.nodeManager.nodes.values()]
    .filter(node => node.connected && isNodeEnabled(client, node));
  if (connectedNodes.length === 0) return undefined;
  return connectedNodes[Math.floor(Math.random() * connectedNodes.length)];
};

getLavalink.isNodeEnabled = isNodeEnabled;
module.exports = getLavalink;
