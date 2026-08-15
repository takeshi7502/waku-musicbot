const SlashCommand = require("../../lib/SlashCommand");
const {
  EmbedBuilder
} = require("discord.js");
const {
  t
} = require("../../util/i18n");
const prettyMilliseconds = require("pretty-ms");
const command = new SlashCommand().setName("save").setDescription(t("save.auto_204")).setRun(async (client, interaction) => {
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
      embeds: [new EmbedBuilder().setColor(0xFF0000).setDescription(t("save.auto_205"))],
      ephemeral: true
    });
  }
  const sendtoDmEmbed = new EmbedBuilder().setColor(client.config.embedColor).setAuthor({
    name: t("save.auto_206"),
    iconURL: `${interaction.user.displayAvatarURL({
      dynamic: true
    })}`
  }).setDescription(t("save.auto_207", {
    var1: player.queue.current.info.title,
    var2: player.queue.current.info.uri
  })).addFields({
    name: t("save.auto_208"),
    value: `\`${prettyMilliseconds(player.queue.current.info.duration, {
      colonNotation: true
    })}\``,
    inline: true
  }, {
    name: t("save.auto_209"),
    value: `\`${player.queue.current.info.author}\``,
    inline: true
  }, {
    name: t("save.auto_210"),
    value: `\`${interaction.guild}\``,
    inline: true
  });
  interaction.user.send({
    embeds: [sendtoDmEmbed]
  });
  return interaction.reply({
    ephemeral: true,
    embeds: [new EmbedBuilder().setColor(client.config.embedColor).setDescription(t("save.auto_211"))],
    ephemeral: true
  });
});
module.exports = command;