const SlashCommand = require("../../lib/SlashCommand");
const {
  EmbedBuilder
} = require("discord.js");
const {
  t
} = require("../../util/i18n");
const command = new SlashCommand().setName("stop").setDescription(t("stop.auto_249")).setRun(async (client, interaction, options) => {
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
      embeds: [new EmbedBuilder().setColor(0xFF0000).setDescription(t("stop.auto_250"))],
      ephemeral: true
    });
  }

  // Trả lời bằng ký tự rỗng ngay lập tức để hoàn tất lệnh, bỏ qua chữ "đang suy nghĩ"
  await interaction.reply({
    content: "** **",
    ephemeral: true
  }).catch(() => {});
  const stopEmbed = new EmbedBuilder().setColor(client.config.embedColor).setDescription(t("stop.auto_251", {
    var1: interaction.user.id
  }));
  const existingMsg = player.get("nowPlayingMessage");
  if (existingMsg && !client.isMessageDeleted(existingMsg)) {
    await existingMsg.edit({
      embeds: [stopEmbed],
      components: []
    }).catch(() => {});
    setTimeout(() => existingMsg.delete().catch(() => {}), 10000);
    client.markMessageAsDeleted(existingMsg);
  }
  player.set("nowPlayingMessage", null);
  if (player.get("twentyFourSeven")) {
    player.queue.splice(0);
    player.stopPlaying(false, false);
    player.set("autoQueue", false);
  } else {
    player.destroy();
  }
  await interaction.deleteReply().catch(() => {});
});
module.exports = command;