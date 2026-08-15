const colors = require("colors");
const {
  EmbedBuilder
} = require("discord.js");
const {
  t
} = require("../../util/i18n");
const SlashCommand = require("../../lib/SlashCommand");
const command = new SlashCommand().setName("autoleave").setDescription(t("autoleave.auto_6")).setRun(async (client, interaction) => {
  let channel = await client.getChannel(client, interaction);
  if (!channel) return;
  let player;
  if (client.manager) player = client.manager.getPlayer(interaction.guild.id);else return interaction.reply({
    ephemeral: true,
    embeds: [new EmbedBuilder().setColor(0xFF0000).setDescription(t("common.noLavalink"))]
  });
  if (!player) {
    return interaction.reply({
      ephemeral: true,
      embeds: [new EmbedBuilder().setColor(0xFF0000).setDescription(t("autoleave.auto_7"))],
      ephemeral: true
    });
  }
  let autoLeaveEmbed = new EmbedBuilder().setColor(client.config.embedColor);
  const autoLeave = player.get("autoLeave");
  player.set("requester", interaction.guild.me);
  if (!autoLeave || autoLeave === false) {
    player.set("autoLeave", true);
  } else {
    player.set("autoLeave", false);
  }
  autoLeaveEmbed.setDescription(t("autoleave.auto_8", {
    var1: !autoLeave ? t("common.on") : t("common.off")
  })).setFooter({
    text: t("autoleave.auto_9", {
      var1: !autoLeave ? "tự động" : "không tự động"
    })
  });
  client.warn(t("autoleave.auto_10", {
    var1: player.guildId,
    var2: colors.blue("autoLeave"),
    var3: colors.blue(!autoLeave ? t("common.on") : t("common.off")),
    var4: client.guilds.cache.get(player.guildId) ? client.guilds.cache.get(player.guildId).name : "một server"
  }));
  return interaction.reply({
    ephemeral: true,
    embeds: [autoLeaveEmbed]
  });
});
module.exports = command;