const {
  EmbedBuilder
} = require("discord.js");
const {
  t
} = require("../../util/i18n");
const {
  escapeMarkdown
} = require('discord.js');
const SlashCommand = require("../../lib/SlashCommand");
const prettyMilliseconds = require("pretty-ms");
const command = new SlashCommand().setName("nowplaying").setDescription(t("nowplaying.auto_159")).setRun(async (client, interaction, options) => {
  let channel = await client.getChannel(client, interaction);
  if (!channel) {
    return;
  }
  let player;
  if (client.manager) {
    player = client.manager.getPlayer(interaction.guild.id);
  } else {
    return interaction.reply({
      embeds: [new EmbedBuilder().setColor(0xFF0000).setDescription(t("common.noLavalink"))]
    });
  }
  if (!player) {
    return interaction.reply({
      embeds: [new EmbedBuilder().setColor(0xFF0000).setDescription(t("player.notInChannel"))],
      ephemeral: true
    });
  }
  if (!player.playing) {
    return interaction.reply({
      embeds: [new EmbedBuilder().setColor(0xFF0000).setDescription(t("common.noSongPlaying"))],
      ephemeral: true
    });
  }
  const song = player.queue.current;
  var title = escapeMarkdown(song.info.title);
  var title = title.replace(/\]/g, "");
  var title = title.replace(/\[/g, "");

  const formatTime = (ms) => {
    const s = Math.floor((ms / 1000) % 60).toString().padStart(2, "0");
    const m = Math.floor((ms / 1000 / 60) % 60).toString().padStart(2, "0");
    const h = Math.floor(ms / 1000 / 60 / 60).toString().padStart(2, "0");
    return h === "00" ? `${m}:${s}` : `${h}:${m}:${s}`;
  };

  const embed = new EmbedBuilder().setColor(client.config.embedColor).setAuthor({
    name: t("player.nowPlaying"),
    iconURL: client.config.iconURL
  })
  .setFields([{
    name: t("player.requestedBy"),
    value: `<@${song.requester.id || song.requester}>`,
    inline: true
  },
  {
    name: t("player.duration"),
    value: song.info.isStream ? `\`LIVE\`` : `\`${formatTime(player.position)} / ${formatTime(song.info.duration)}\``,
    inline: true
  }])
  .setThumbnail(song.info.artworkUrl)
  .setDescription(`[${title}](${song.info.uri})` || t("player.noDescription"));

  // Delete the old player interaction if it exists
  const oldMsg = player.get("nowPlayingMessage");
  if (oldMsg && !client.isMessageDeleted(oldMsg)) {
    oldMsg.delete().catch(() => {});
    client.markMessageAsDeleted(oldMsg);
  }

  // Assign the new text channel
  player.set("textChannelId", interaction.channel.id);

  const messagePayload = {
    embeds: [embed],
    components: client.createController(player.guildId, player),
    fetchReply: true
  };

  // Reply with the new interactive player panel
  const newMsg = await interaction.reply(messagePayload);
  
  // Register the new message to the background updater interval
  if (newMsg) {
    player.set("nowPlayingMessage", newMsg);
  }
});
module.exports = command;