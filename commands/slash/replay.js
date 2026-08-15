const SlashCommand = require("../../lib/SlashCommand");
const {
  EmbedBuilder
} = require("discord.js");
const {
  t
} = require("../../util/i18n");
const command = new SlashCommand().setName("replay").setDescription(t("replay.auto_200")).setRun(async (client, interaction, options) => {
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
      embeds: [new EmbedBuilder().setColor(0xFF0000).setDescription(t("player.notPlaying"))],
      ephemeral: true
    });
  }
  await interaction.deferReply({
    ephemeral: true
  });
  player.seek(0);
  let song = player.queue.current;
  return interaction.editReply({
    embeds: [new EmbedBuilder().setColor(client.config.embedColor).setDescription(t("player.replay", {
      title: song.info.title,
      url: song.info.uri
    }))]
  });
});
module.exports = command;