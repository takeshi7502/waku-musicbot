const SlashCommand = require("../../lib/SlashCommand");
const {
  EmbedBuilder
} = require("discord.js");
const {
  t
} = require("../../util/i18n");
const {
  escapeMarkdown
} = require("discord.js");

/**
 * Lấy danh sách tất cả node đang connected, shuffle ngẫu nhiên
 * @param {import("../../lib/DiscordMusicBot")} client
 * @returns {import("lavalink-client").LavalinkNode[]}
 */
function getShuffledNodes(client) {
  const nodes = [...client.manager.nodeManager.nodes.values()].filter(n => n.connected);
  for (let i = nodes.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [nodes[i], nodes[j]] = [nodes[j], nodes[i]];
  }
  return nodes;
}

/**
 * Thử search trên nhiều node cho đến khi thành công
 * @returns {{ res, node } | null}
 */
async function searchWithFallback(player, query, user, nodes, client) {
  for (const node of nodes) {
    try {
      if (player.node?.id !== node.id) {
        try { await player.changeNode(node.id); } catch {}
      }
      const res = await player.search({ query }, user);
      if (res && res.loadType !== "error" && res.loadType !== "empty") {
        return { res, node };
      }
      client.warn(`Node ${node.id} search failed (${res?.loadType}), trying next...`);
    } catch (err) {
      client.warn(`Node ${node.id} error: ${err.message}, trying next...`);
    }
  }
  return null;
}

const command = new SlashCommand()
  .setName("play")
  .setDescription(t("play.auto_165"))
  .addStringOption(option =>
    option.setName("query").setDescription(t("play.auto_166")).setAutocomplete(true).setRequired(true)
  )
  .setRun(async (client, interaction, options) => {
    let channel = await client.getChannel(client, interaction);
    if (!channel) return;

    // Defer trước để tránh timeout 3 giây của Discord
    await interaction.deferReply();

    let player = client.manager.getPlayer(interaction.guild.id);
    let nodesToTry;

    // Chỉ lấy random node khi chưa có player hoặc player đang không phát nhạc gì cả
    if (!player || (!player.playing && !player.paused && !player.queue.current)) {
      const availableNodes = getShuffledNodes(client);
      if (availableNodes.length === 0) {
        return interaction.editReply({
          embeds: [client.ErrorEmbed(t("common.noLavalink"))]
        });
      }
      if (!player) {
        player = client.createPlayer(interaction.channel, channel, availableNodes[0]);
      }
      nodesToTry = availableNodes;
    } else {
      // Nếu đang phát nhạc, BẮT BUỘC dùng node hiện tại, không được đổi node ngang xương
      nodesToTry = [player.node];
    }

    if (!player.connected) {
      await player.connect();
    }

    if (channel.type == 13) {
      setTimeout(() => {
        if (interaction.guild.members.me.voice.suppress == true) {
          try {
            interaction.guild.members.me.voice.setSuppressed(false);
          } catch (e) {
            interaction.guild.members.me.voice.setRequestToSpeak(true);
          }
        }
      }, 2000);
    }

    const ret = await interaction.editReply({
      embeds: [new EmbedBuilder().setColor(client.config.embedColor).setDescription(t("player.searching"))]
    });

    const query = options.getString("query", true);

    // Thử search qua danh sách node hợp lệ (sẽ chỉ là 1 node nếu đang phát nhạc)
    const result = await searchWithFallback(player, query, interaction.user, nodesToTry, client);

    if (!result) {
      console.log("Lavalink Search Error: All nodes failed for query:", query);
      if (!player.queue.current) player.destroy();
      await interaction.editReply({
        embeds: [new EmbedBuilder().setColor(0xFF0000).setDescription(t("player.searchError"))]
      }).catch(() => {});
      if (ret) setTimeout(() => ret.delete().catch(() => {}), 10000);
      return ret;
    }

    const { res } = result;

    if (res.loadType === "empty") {
      if (!player.queue.current) player.destroy();
      await interaction.editReply({
        embeds: [new EmbedBuilder().setColor(0xFF0000).setDescription(t("player.noResults"))]
      }).catch(() => {});
      if (ret) setTimeout(() => ret.delete().catch(() => {}), 10000);
      return ret;
    }

    if (res.loadType === "track" || res.loadType === "search") {
      await player.queue.add(res.tracks[0]);
      if (!player.playing && !player.paused && player.queue.tracks.length > 0) {
        await player.play({ paused: false });
      }
      let title = escapeMarkdown(res.tracks[0].info.title);
      title = title.replace(/\]/g, "").replace(/\[/g, "");
      const duration = res.tracks[0].info.isStream
        ? "`LIVE 🔴`"
        : `\`${client.ms(res.tracks[0].info.duration, { colonNotation: true, secondsDecimalDigits: 0 })}\``;
      const trackUser = res.tracks[0].requester;
      const trackUserId = typeof trackUser === "object" ? trackUser.id : trackUser;
      await interaction.editReply({
        embeds: [new EmbedBuilder().setColor(client.config.embedColor).setDescription(
          t("player.added", {
            title,
            url: res.tracks[0].info.uri,
            user: trackUserId ? `<@${trackUserId}>` : "Unknown",
            duration
          })
        )]
      }).catch(() => {});
    }

    if (res.loadType === "playlist") {
      await player.queue.add(res.tracks);
      if (!player.playing && !player.paused && player.queue.tracks.length > 0) {
        await player.play({ paused: false });
      }
      const playlistDuration = res.tracks.reduce((a, track) => a + (track.info.duration || 0), 0);
      const durationStr = client.ms(playlistDuration, { colonNotation: true, secondsDecimalDigits: 0 });
      const playlistName = res.playlist?.name || "Playlist";
      const plUser = res.tracks[0].requester;
      const plUserId = typeof plUser === "object" ? plUser.id : plUser;
      await interaction.editReply({
        embeds: [new EmbedBuilder().setColor(client.config.embedColor).setDescription(
          t("player.addedPlaylist", {
            name: playlistName,
            user: plUserId ? `<@${plUserId}>` : "Unknown",
            duration: durationStr,
            count: res.tracks.length
          })
        )]
      }).catch(() => {});
    }

    if (ret) setTimeout(() => ret.delete().catch(() => {}), 10000);
    return ret;
  });

module.exports = command;