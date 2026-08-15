const SlashCommand = require("../../lib/SlashCommand");
const {
  EmbedBuilder
} = require("discord.js");
const {
  t
} = require("../../util/i18n");
const command = new SlashCommand().setName("loopq").setDescription(t("player.loopQueueEnabled")).setRun(async (client, interaction, options) => {
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
      embeds: [new EmbedBuilder().setColor(0xFF0000).setDescription(t("loopq.auto_140"))],
      ephemeral: true
    });
  }
  const currentMode = player.repeatMode;
  if (currentMode === "queue") {
    player.setRepeatMode("off");
  } else {
    player.setRepeatMode("queue");
  }
  const queueRepeat = player.repeatMode === "queue" ? "enabled" : "disabled";
  interaction.reply({
    ephemeral: true,
    embeds: [new EmbedBuilder().setColor(client.config.embedColor).setDescription(t("loopq.auto_141", {
      var1: queueRepeat
    }))]
  });
});
module.exports = command;