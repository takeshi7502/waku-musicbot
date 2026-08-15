const SlashCommand = require("../../lib/SlashCommand");
const {
  EmbedBuilder
} = require("discord.js");
const {
  t
} = require("../../util/i18n");
const command = new SlashCommand().setName("loop").setDescription(t("loop.auto_137")).setRun(async (client, interaction, options) => {
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
      embeds: [new EmbedBuilder().setColor(0xFF0000).setDescription(t("loop.auto_138"))],
      ephemeral: true
    });
  }
  const currentMode = player.repeatMode;
  if (currentMode === "track") {
    player.setRepeatMode("off");
  } else {
    player.setRepeatMode("track");
  }
  const trackRepeat = player.repeatMode === "track" ? "enabled" : "disabled";
  interaction.reply({
    ephemeral: true,
    embeds: [new EmbedBuilder().setColor(client.config.embedColor).setDescription(t("loop.auto_139", {
      var1: trackRepeat
    }))]
  });
});
module.exports = command;