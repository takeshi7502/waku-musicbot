const SlashCommand = require("../../lib/SlashCommand");
const {
  EmbedBuilder
} = require("discord.js");
const {
  t
} = require("../../util/i18n");
const command = new SlashCommand().setName("remove").setDescription(t("remove.auto_197")).addNumberOption(option => option.setName("number").setDescription(t("remove.auto_198")).setRequired(true)).setRun(async (client, interaction) => {
  const args = interaction.options.getNumber("number");
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
      embeds: [new EmbedBuilder().setColor(0xFF0000).setDescription(t("player.noSongToRemove"))],
      ephemeral: true
    });
  }
  await interaction.deferReply({
    ephemeral: true
  });
  const position = Number(args) - 1;
  if (position > player.queue.tracks.length) {
    let thing = new EmbedBuilder().setColor(client.config.embedColor).setDescription(t("remove.auto_199", {
      var1: player.queue.tracks.length
    }));
    return interaction.editReply({
      embeds: [thing]
    });
  }
  const song = player.queue.tracks[position];
  player.queue.splice(position, 1);
  const number = position + 1;
  let removeEmbed = new EmbedBuilder().setColor(client.config.embedColor).setDescription(t("player.removed", {
    number
  }));
  return interaction.editReply({
    embeds: [removeEmbed]
  });
});
module.exports = command;