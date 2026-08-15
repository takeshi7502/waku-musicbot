const SlashCommand = require("../../lib/SlashCommand");
const {
  EmbedBuilder,
  ChannelType
} = require("discord.js");
const {
  t
} = require("../../util/i18n");
const command = new SlashCommand().setName("setup").setDescription(t("setup.auto_228")).addChannelOption(option => option.setName("channel").setDescription(t("setup.auto_229")).addChannelTypes(ChannelType.GuildText).setRequired(true)).setRun(async (client, interaction, options) => {
  // Chỉ những người có quyền quản lý server mới được setup
  if (!interaction.member.permissions.has("ManageGuild")) {
    return interaction.reply({
      embeds: [client.ErrorEmbed(t("setup.noPermission"))],
      ephemeral: true
    });
  }
  const channel = options.getChannel("channel");

  // Lưu vào db.json
  await client.database.set(`announce_channel_${interaction.guildId}`, channel.id);
  const embed = new EmbedBuilder().setColor(client.config.embedColor).setDescription(t("setup.auto_230", {
    var1: channel.id
  }));
  return interaction.reply({
    embeds: [embed]
  });
});
module.exports = command;