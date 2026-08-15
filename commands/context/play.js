const {
  ContextMenuCommandBuilder
} = require("discord.js");
const {
  EmbedBuilder,
  escapeMarkdown
} = require("discord.js");
const {
  t
} = require("../../util/i18n");
module.exports = {
  command: new ContextMenuCommandBuilder().setName(t("play.auto_259")).setType(3),
  /**
   * This function will handle context menu interaction
   * @param {import("../lib/DiscordMusicBot")} client
   * @param {import("discord.js").ContextMenuCommandInteraction} interaction
   */
  run: async (client, interaction, options) => {
    let channel = await client.getChannel(client, interaction);
    if (!channel) {
      return;
    }
    let node = await client.getLavalink(client);
    if (!node) {
      return interaction.reply({
        embeds: [client.ErrorEmbed(t("common.noLavalink"))],
        ephemeral: true
      });
    }
    let player = client.manager.getPlayer(interaction.guild.id);
    if (!player) {
      player = client.createPlayer(interaction.channel, channel, node);
    }
    if (!player.connected) {
      await player.connect();
    }
    if (channel.type == 13) {
      // GUILD_STAGE_VOICE
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
    const ret = await interaction.reply({
      embeds: [new EmbedBuilder().setColor(client.config.embedColor).setDescription(t("player.searching"))],
      fetchReply: true
    });
    const query = interaction.channel.messages.cache.get(interaction.targetId)?.content ?? (await interaction.channel.messages.fetch(interaction.targetId))?.content ?? "";
    let res = await player.search({
      query
    }, interaction.user).catch(err => {
      client.error(err);
      return {
        loadType: "error"
      };
    });
    if (res.loadType === "error") {
      if (!player.queue.current) {
        player.destroy();
      }
      await interaction.deleteReply().catch(() => {});
      await interaction.followUp({
        embeds: [new EmbedBuilder().setColor(0xFF0000).setDescription(t("player.searchError"))],
        ephemeral: true
      }).catch(() => {});
    }
    if (res.loadType === "empty") {
      if (!player.queue.current) {
        player.destroy();
      }
      await interaction.deleteReply().catch(() => {});
      await interaction.followUp({
        embeds: [new EmbedBuilder().setColor(0xFF0000).setDescription(t("player.noResults"))],
        ephemeral: true
      }).catch(() => {});
    }
    if (res.loadType === "track" || res.loadType === "search") {
      await player.queue.add(res.tracks[0]);
      if (!player.playing && !player.paused && player.queue.tracks.length > 0) {
        await player.play({
          paused: false
        });
      }
      var title = escapeMarkdown(res.tracks[0].info.title);
      title = title.replace(/\]/g, "");
      title = title.replace(/\[/g, "");
      const duration = res.tracks[0].info.isStream ? "`LIVE 🔴`" : `\`${client.ms(res.tracks[0].info.duration, {
        colonNotation: true,
        secondsDecimalDigits: 0
      })}\``;
      const trackUser = res.tracks[0].requester;
      const trackUserId = typeof trackUser === "object" ? trackUser.id : trackUser;
      const addText = t("player.added", {
        title: title,
        url: res.tracks[0].info.uri,
        user: trackUserId ? `<@${trackUserId}>` : "Unknown",
        duration: duration
      });
      await interaction.editReply({
        embeds: [new EmbedBuilder().setColor(client.config.embedColor).setDescription(addText)]
      }).catch(() => {});
    }
    if (res.loadType === "playlist") {
      await player.queue.add(res.tracks);
      const totalSize = player.queue.tracks.length + (player.queue.current ? 1 : 0);
      if (!player.playing && !player.paused && player.queue.tracks.length > 0) {
        await player.play({
          paused: false
        });
      }
      const playlistDuration = res.tracks.reduce((a, t) => a + (t.info.duration || 0), 0);
      const durationStr = client.ms(playlistDuration, {
        colonNotation: true,
        secondsDecimalDigits: 0
      });
      const playlistName = res.playlist?.name || "Playlist";
      const plUser = res.tracks[0].requester;
      const plUserId = typeof plUser === "object" ? plUser.id : plUser;
      const addText = t("player.addedPlaylist", {
        name: playlistName,
        user: plUserId ? `<@${plUserId}>` : "Unknown",
        duration: durationStr,
        count: res.tracks.length
      });
      await interaction.editReply({
        embeds: [new EmbedBuilder().setColor(client.config.embedColor).setDescription(addText)]
      }).catch(() => {});
    }
    if (ret) setTimeout(() => ret.delete().catch(() => {}), 10000);
    return ret;
  }
};