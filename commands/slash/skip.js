const SlashCommand = require("../../lib/SlashCommand");
const {
  EmbedBuilder
} = require("discord.js");
const {
  t
} = require("../../util/i18n");
const command = new SlashCommand().setName("skip").setDescription(t("skip.auto_232")).setRun(async (client, interaction, options) => {
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
      embeds: [new EmbedBuilder().setColor(0xFF0000).setDescription(t("player.nothingToSkip"))],
      ephemeral: true
    });
  }
  const song = player.queue.current;
  const autoQueue = player.get("autoQueue");
  if (player.queue.tracks[0] == undefined && (!autoQueue || autoQueue === false)) {
    return interaction.reply({
      ephemeral: true,
      embeds: [new EmbedBuilder().setColor(0xFF0000).setDescription(t("player.nothingAfterSkip", {
        title: song.info.title,
        url: song.info.uri
      }))]
    });
  }
  player.stopPlaying(false, false);
  interaction.reply({
    embeds: [new EmbedBuilder().setColor(client.config.embedColor).setDescription(t("player.skipped"))]
  });
});
module.exports = command;