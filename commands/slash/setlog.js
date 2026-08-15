const SlashCommand = require("../../lib/SlashCommand");
const {
  EmbedBuilder,
  ChannelType
} = require("discord.js");
const {
  t
} = require("../../util/i18n");
const command = new SlashCommand().setName("setlog").setDescription(t("setlog.auto_225")).setAdminOnly(true).addChannelOption(option => option.setName("channel").setDescription(t("setlog.auto_226")).addChannelTypes(ChannelType.GuildText).setRequired(true)).setRun(async (client, interaction, options) => {
  // Chỉ tài khoản Admin cấu hình trong config mới xài được
  if (interaction.user.id !== client.config.adminId) {
    return interaction.reply({
      embeds: [client.ErrorEmbed(t("setlog.noPermission"))],
      ephemeral: true
    });
  }
  const channel = options.getChannel("channel");

  // Lưu vào db.json cái ID của kênh log
  await client.database.set("admin_log_channel", channel.id);
  const embed = new EmbedBuilder().setColor(client.config.embedColor).setDescription(t("setlog.auto_227", {
    var1: channel.id
  }));
  return interaction.reply({
    embeds: [embed]
  });
});
module.exports = command;