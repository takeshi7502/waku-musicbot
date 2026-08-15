const { t } = require("../util/i18n");
/**
 *
 * @param {import("../lib/DiscordMusicBot")} client
 */
module.exports = async client => {
  try {
    await client.manager.init({
      id: client.user.id,
      username: client.user.username
    });
  } catch (err) {
    client.warn(t("ready.auto_281", {
      var1: err.message
    }));
    // Gửi thông báo vào kênh setlog
    if (client.sendLavalinkNotification) {
      const {
        EmbedBuilder
      } = require("discord.js");
      client.sendLavalinkNotification(new EmbedBuilder().setColor("#FF8800").setDescription(t("ready.auto_282", {
        var1: err.message
      })).setTimestamp());
    }
  }
  client.user.setPresence(client.config.presence);
  client.log(t("ready.auto_283") + client.user.tag);
};