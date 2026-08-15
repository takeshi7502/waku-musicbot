const SlashCommand = require("../../lib/SlashCommand");
const {
  EmbedBuilder
} = require("discord.js");
const {
  t
} = require("../../util/i18n");
const command = new SlashCommand().setName("move").setDescription(t("move.auto_154")).addIntegerOption(option => option.setName("track").setDescription(t("move.auto_155")).setRequired(true)).addIntegerOption(option => option.setName("position").setDescription(t("move.auto_156")).setRequired(true)).setRun(async (client, interaction) => {
  const track = interaction.options.getInteger("track");
  const position = interaction.options.getInteger("position");
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
  let trackNum = Number(track) - 1;
  if (trackNum < 0 || trackNum > player.queue.tracks.length - 1) {
    return interaction.reply(t("move.auto_157"));
  }
  let dest = Number(position) - 1;
  if (dest < 0 || dest > player.queue.tracks.length - 1) {
    return interaction.reply(t("move.auto_158"));
  }
  const thing = player.queue.tracks[trackNum];
  player.queue.splice(trackNum, 1);
  player.queue.splice(dest, 0, thing);
  return interaction.reply({
    ephemeral: true,
    embeds: [new EmbedBuilder().setColor(client.config.embedColor).setDescription(t("player.moved"))]
  });
});
module.exports = command;