const SlashCommand = require("../../lib/SlashCommand");
const {
  EmbedBuilder
} = require("discord.js");
const {
  t
} = require("../../util/i18n");
const command = new SlashCommand().setName("previous").setDescription(t("previous.auto_167")).setRun(async (client, interaction) => {
  let channel = await client.getChannel(client, interaction);
  if (!channel) {
    return;
  }
  let player;
  if (client.manager) {
    player = client.manager.getPlayer(interaction.guild.id);
  } else {
    return interaction.reply({
      ephemeral: true,
      embeds: [new EmbedBuilder().setColor(0xFF0000).setDescription(t("common.noLavalink"))]
    });
  }
  if (!player) {
    return interaction.reply({
      ephemeral: true,
      embeds: [new EmbedBuilder().setColor(0xFF0000).setDescription(t("player.noPreviousSession"))],
      ephemeral: true
    });
  }
  const previousSongs = player.queue.previous;
  const previousSong = previousSongs && previousSongs.length > 0 ? previousSongs[0] : null;
  const currentSong = player.queue.current;
  const nextSong = player.queue.tracks[0];
  if (!previousSong || previousSong === currentSong || previousSong === nextSong) {
    return interaction.reply({
      ephemeral: true,
      embeds: [new EmbedBuilder().setColor(0xFF0000).setDescription(t("player.noPreviousQueue"))]
    });
  }
  if (previousSong !== currentSong && previousSong !== nextSong) {
    player.queue.tracks.splice(0, 0, currentSong);
    player.play({
      clientTrack: previousSong
    });
    return interaction.reply({
      ephemeral: true,
      embeds: [new EmbedBuilder().setColor(client.config.embedColor).setDescription(t("previous.auto_168", {
        var1: previousSong.info.title
      }))]
    });
  }
});
module.exports = command;