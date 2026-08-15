const colors = require("colors");
const {
  EmbedBuilder
} = require("discord.js");
const {
  t
} = require("../../util/i18n");
const SlashCommand = require("../../lib/SlashCommand");
const command = new SlashCommand().setName("autopause").setDescription(t("autopause.auto_11")).setRun(async (client, interaction) => {
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
      embeds: [new EmbedBuilder().setColor(0xFF0000).setDescription(t("autopause.auto_12"))],
      ephemeral: true
    });
  }
  let autoPauseEmbed = new EmbedBuilder().setColor(client.config.embedColor);
  const autoPause = player.get("autoPause");
  player.set("requester", interaction.guild.members.me);
  if (!autoPause || autoPause === false) {
    player.set("autoPause", true);
  } else {
    player.set("autoPause", false);
  }
  autoPauseEmbed.setDescription(t("autopause.auto_13", {
    var1: !autoPause ? t("common.on") : t("common.off")
  })).setFooter({
    text: t("autopause.auto_14", {
      var1: !autoPause ? t("common.willNow") : t("common.willNoLonger")
    })
  });
  client.warn(t("autopause.auto_15", {
    var1: player.guildId,
    var2: colors.blue("AUTOPAUSE"),
    var3: colors.blue(!autoPause ? t("common.on") : t("common.off")),
    var4: client.guilds.cache.get(player.guildId) ? client.guilds.cache.get(player.guildId).name : "một server"
  }));
  return interaction.reply({
    ephemeral: true,
    embeds: [autoPauseEmbed]
  });
});
module.exports = command;