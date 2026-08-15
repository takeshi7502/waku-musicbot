const SlashCommand = require("../../lib/SlashCommand");
const {
  EmbedBuilder
} = require("discord.js");
const {
  t
} = require("../../util/i18n");
const command = new SlashCommand().setName("clear").setDescription(t("clear.auto_41")).setRun(async (client, interaction, options) => {
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
      embeds: [new EmbedBuilder().setColor(0xFF0000).setDescription(t("clear.auto_42"))],
      ephemeral: true
    });
  }
  if (!player.queue || !player.queue.tracks.length || player.queue.tracks.length === 0) {
    let cembed = new EmbedBuilder().setColor(client.config.embedColor).setDescription(t("clear.auto_43"));
    return interaction.reply({
      ephemeral: true,
      embeds: [cembed],
      ephemeral: true
    });
  }
  const count = player.queue.tracks.length;
  player.queue.tracks.splice(0);
  let clearEmbed = new EmbedBuilder().setColor(client.config.embedColor).setDescription(t("queue.cleared", {
    count
  }));
  return interaction.reply({
    ephemeral: true,
    embeds: [clearEmbed]
  });
});
module.exports = command;