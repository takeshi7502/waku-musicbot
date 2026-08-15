const SlashCommand = require("../../lib/SlashCommand");
const {
  EmbedBuilder
} = require("discord.js");
const {
  t
} = require("../../util/i18n");
const ms = require("ms");
const command = new SlashCommand().setName("seek").setDescription(t("seek.auto_221")).addStringOption(option => option.setName("time").setDescription(t("seek.auto_222")).setRequired(true)).setRun(async (client, interaction, options) => {
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
  await interaction.deferReply({
    ephemeral: true
  });
  const rawArgs = interaction.options.getString("time");
  const args = rawArgs.split(' ');
  var rawTime = [];
  for (i = 0; i < args.length; i++) {
    rawTime.push(ms(args[i]));
  }
  const time = rawTime.reduce((a, b) => a + b, 0);
  const position = player.position;
  const duration = player.queue.current.info.duration;
  if (time <= duration) {
    player.seek(time);
    return interaction.editReply({
      embeds: [new EmbedBuilder().setColor(client.config.embedColor).setDescription(t("seek.auto_223", {
        var1: player.queue.current.info.title,
        var2: time < position ? "quay lại" : "chuyển đến",
        var3: ms(time)
      }))]
    });
  } else {
    return interaction.editReply({
      embeds: [new EmbedBuilder().setColor(client.config.embedColor).setDescription(t("seek.auto_224"))]
    });
  }
});
module.exports = command;