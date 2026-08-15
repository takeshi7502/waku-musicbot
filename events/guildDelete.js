const { t } = require("../util/i18n");
const {
  EmbedBuilder
} = require("discord.js");
module.exports = async (client, guild) => {
  try {
    client.warn(t("guildDelete.auto_274", {
      var1: guild.name,
      var2: guild.id
    }));

    // Lấy ID kênh log từ database
    const logChannelId = await client.database.get("admin_log_channel");
    if (logChannelId) {
      const logChannel = client.channels.cache.get(logChannelId);
      if (logChannel) {
        const embed = new EmbedBuilder().setColor("#FF0000") // Màu đỏ: Bị kick/ẩn
        .setAuthor({
          name: t("guildDelete.auto_275")
        }).setThumbnail(guild.iconURL() || client.user.displayAvatarURL()).addFields({
          name: t("guildDelete.auto_276"),
          value: `\`${guild.name}\``,
          inline: true
        }, {
          name: "ID Server",
          value: `\`${guild.id}\``,
          inline: true
        }, {
          name: t("guildDelete.auto_277"),
          value: `\`${client.guilds.cache.size}\` Server`,
          inline: false
        }).setTimestamp();
        await logChannel.send({
          embeds: [embed]
        }).catch(() => {});
      }
    }
  } catch (error) {
    client.error(t("guildDelete.auto_278", {
      var1: error.message
    }));
  }
};