const colors = require("colors");
const {
  EmbedBuilder
} = require("discord.js");
const {
  t,
  translate,
  DEFAULT_LANGUAGE
} = require("../../util/i18n");
const {
  refreshNowPlayingPanel
} = require("../../util/nowPlayingEmbed");
const SlashCommand = require("../../lib/SlashCommand");
const command = new SlashCommand().setName("autoqueue").setDescription(t("autoqueue.auto_16")).setRun(async (client, interaction) => {
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
      embeds: [new EmbedBuilder().setColor(0xFF0000).setDescription(t("autoqueue.auto_17"))],
      ephemeral: true
    });
  }
  let autoQueueEmbed = new EmbedBuilder().setColor(client.config.embedColor);
  const autoQueue = player.get("autoQueue");
  player.set("requester", interaction.guild.members.me);
  if (!autoQueue || autoQueue === false) {
    player.set("autoQueue", true);
  } else {
    player.set("autoQueue", false);
  }
  await refreshNowPlayingPanel(client, player).catch(() => {});
  autoQueueEmbed.setDescription(t("autoqueue.auto_18", {
    var1: !autoQueue ? t("common.on") : t("common.off")
  })).setFooter({
    text: t("autoqueue.auto_19", {
      var1: !autoQueue ? t("common.willNow") : t("common.willNoLonger")
    })
  });
  client.warn(translate(DEFAULT_LANGUAGE, "autoqueue.auto_20", {
    var1: player.guildId,
    var2: colors.blue("AUTOQUEUE"),
    var3: colors.blue(!autoQueue ? t("common.on") : t("common.off")),
    var4: client.guilds.cache.get(player.guildId) ? client.guilds.cache.get(player.guildId).name : "một server"
  }));
  return interaction.reply({
    ephemeral: true,
    embeds: [autoQueueEmbed]
  });
});
module.exports = command;
