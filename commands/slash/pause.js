const SlashCommand = require("../../lib/SlashCommand");
const {
  EmbedBuilder
} = require("discord.js");
const {
  t
} = require("../../util/i18n");
const command = new SlashCommand().setName("pause").setDescription(t("pause.auto_162")).setRun(async (client, interaction, options) => {
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
      embeds: [new EmbedBuilder().setColor(0xFF0000).setDescription(t("common.noSongPlaying"))],
      ephemeral: true
    });
  }
  if (player.paused) {
    return interaction.reply({
      ephemeral: true,
      embeds: [new EmbedBuilder().setColor(0xFF0000).setDescription(t("player.alreadyPaused"))],
      ephemeral: true
    });
  }
  player.pause();
  return interaction.reply({
    embeds: [new EmbedBuilder().setColor(client.config.embedColor).setDescription(t("pause.auto_163"))]
  });
});
module.exports = command;