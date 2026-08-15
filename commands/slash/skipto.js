const SlashCommand = require("../../lib/SlashCommand");
const {
  EmbedBuilder
} = require("discord.js");
const {
  t
} = require("../../util/i18n");
const command = new SlashCommand().setName("skipto").setDescription(t("skipto.auto_233")).addNumberOption(option => option.setName("number").setDescription(t("skipto.auto_234")).setRequired(true)).setRun(async (client, interaction, options) => {
  const args = interaction.options.getNumber("number");
  //const duration = player.queue.current.info.duration

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
      embeds: [new EmbedBuilder().setColor(0xFF0000).setDescription(t("player.notInChannelSkipto"))],
      ephemeral: true
    });
  }
  await interaction.deferReply({
    ephemeral: true
  });
  const position = Number(args);
  try {
    if (!position || position < 0 || position > player.queue.tracks.length) {
      let thing = new EmbedBuilder().setColor(client.config.embedColor).setDescription(t("player.invalidPosition"));
      return interaction.editReply({
        embeds: [thing]
      });
    }
    player.queue.splice(0, position - 1);
    player.stopPlaying(false, false);
    let thing = new EmbedBuilder().setColor(client.config.embedColor).setDescription(t("skipto.auto_235") + position);
    return interaction.editReply({
      embeds: [thing]
    });
  } catch {
    if (position === 1) {
      player.stopPlaying(false, false);
    }
    return interaction.editReply({
      embeds: [new EmbedBuilder().setColor(client.config.embedColor).setDescription(t("skipto.auto_236") + position)]
    });
  }
});
module.exports = command;