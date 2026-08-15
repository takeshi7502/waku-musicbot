const { t } = require("../util/i18n");
const {
  EmbedBuilder,
  ChannelType
} = require("discord.js");
module.exports = async (client, guild) => {
  try {
    client.log(t("guildCreate.auto_260", {
      var1: guild.name,
      var2: guild.id,
      var3: guild.memberCount
    }));

    // Lấy ID kênh log từ database (Kênh này do Admin gốc gõ /setlog để cấu hình)
    const logChannelId = await client.database.get("admin_log_channel");
    if (logChannelId) {
      const logChannel = client.channels.cache.get(logChannelId);
      if (logChannel) {
        // Lấy thông tin người chủ của Server mới bế bot vào (tuỳ chọn)
        let ownerStr = t("guildCreate.auto_261");
        try {
          const owner = await guild.fetchOwner();
          ownerStr = `${owner.user.tag} (ID: ${owner.id})`;
        } catch (e) {}
        const embed = new EmbedBuilder().setColor("#00FF00") // Màu xanh lá: Vào mới
        .setAuthor({
          name: t("guildCreate.auto_262")
        }).setThumbnail(guild.iconURL() || client.user.displayAvatarURL()).addFields({
          name: t("guildCreate.auto_263"),
          value: `\`${guild.name}\``,
          inline: true
        }, {
          name: "ID Server",
          value: `\`${guild.id}\``,
          inline: true
        }, {
          name: t("guildCreate.auto_264"),
          value: `\`${guild.memberCount}\`👤`,
          inline: true
        }, {
          name: t("guildCreate.auto_265"),
          value: `\`${ownerStr}\``,
          inline: false
        }, {
          name: t("guildCreate.auto_266"),
          value: `\`${client.guilds.cache.size}\` Server`,
          inline: false
        }).setTimestamp();
        await logChannel.send({
          embeds: [embed]
        }).catch(() => {});
      }
    }

    // ----------------------------------------------------
    // GỬI LỜI CHÀO MỜI ĐẾN MÁY CHỦ VỪA THAM GIA
    // ----------------------------------------------------
    const targetChannel = guild.channels.cache.find(c => c.type === ChannelType.GuildText && c.permissionsFor(guild.members.me).has("SendMessages") && c.permissionsFor(guild.members.me).has("ViewChannel"));
    if (targetChannel) {
      const welcomeEmbed = new EmbedBuilder().setColor(client.config.embedColor).setAuthor({
        name: t("guildCreate.auto_267"),
        iconURL: client.config.iconURL || client.user.displayAvatarURL()
      }).setTitle(t("guildCreate.auto_268")).setDescription(t("guildCreate.auto_269") + t("guildCreate.auto_270") + t("guildCreate.auto_271") + t("guildCreate.auto_272")).setThumbnail(client.user.displayAvatarURL()).setTimestamp();
      await targetChannel.send({
        embeds: [welcomeEmbed]
      }).catch(() => {});
    }
  } catch (error) {
    client.error(t("guildCreate.auto_273", {
      var1: error.message
    }));
  }
};