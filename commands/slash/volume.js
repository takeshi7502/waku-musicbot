const SlashCommand = require("../../lib/SlashCommand");
const {
  EmbedBuilder
} = require("discord.js");
const {
  t
} = require("../../util/i18n");
const command = new SlashCommand().setName("volume").setDescription(t("volume.auto_255")).addNumberOption(option => option.setName("amount").setDescription(t("volume.auto_256")).setRequired(false)).setRun(async (client, interaction) => {
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
      embeds: [new EmbedBuilder().setColor(0xFF0000).setDescription(t("player.noTracksPlaying"))],
      ephemeral: true
    });
  }
  let vol = interaction.options.getNumber("amount");
  if (!vol || vol < 1 || vol > 125) {
    return interaction.reply({
      ephemeral: true,
      embeds: [new EmbedBuilder().setColor(client.config.embedColor).setDescription(t("volume.auto_257", {
        var1: player.volume
      }))]
    });
  }
  player.setVolume(vol);
  return interaction.reply({
    ephemeral: true,
    embeds: [new EmbedBuilder().setColor(client.config.embedColor).setDescription(t("volume.auto_258", {
      var1: player.volume
    }))]
  });
});
module.exports = command;