const colors = require("colors");
const {
  EmbedBuilder
} = require("discord.js");
const {
  t
} = require("../../util/i18n");
const SlashCommand = require("../../lib/SlashCommand");
const command = new SlashCommand().setName("247").setDescription(t("247.auto_1")).setRun(async (client, interaction, options) => {
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
      embeds: [new EmbedBuilder().setColor(0xFF0000).setDescription(t("247.auto_2"))],
      ephemeral: true
    });
  }
  let twentyFourSevenEmbed = new EmbedBuilder().setColor(client.config.embedColor);
  const twentyFourSeven = player.get("twentyFourSeven");
  if (!twentyFourSeven || twentyFourSeven === false) {
    player.set("twentyFourSeven", true);
  } else {
    player.set("twentyFourSeven", false);
  }
  twentyFourSevenEmbed.setDescription(t("247.auto_3", {
    var1: !twentyFourSeven ? t("common.on") : t("common.off")
  })).setFooter({
    text: t("247.auto_4", {
      var1: !twentyFourSeven ? t("common.willNow") : t("common.willNoLonger")
    })
  });
  client.warn(t("247.auto_5", {
    var1: player.guildId,
    var2: colors.blue("24/7"),
    var3: colors.blue(!twentyFourSeven ? t("common.on") : t("common.off")),
    var4: client.guilds.cache.get(player.guildId) ? client.guilds.cache.get(player.guildId).name : "một server"
  }));
  if (!player.playing && player.queue.tracks.length + (player.queue.current ? 1 : 0) === 0 && twentyFourSeven) {
    player.destroy();
  }
  return interaction.reply({
    ephemeral: true,
    embeds: [twentyFourSevenEmbed]
  });
});
module.exports = command;
// check above message, it is a little bit confusing. and erros are not handled. probably should be fixed.
// ok use catch ez kom  follow meh ;_;
// the above message meaning error, if it cant find it or take too long the bot crashed
// play commanddddd, if timeout or takes 1000 years to find song it crashed
// OKIE, leave the comment here for idk
// Comment very useful, 247 good :+1:
// twentyFourSeven = best;