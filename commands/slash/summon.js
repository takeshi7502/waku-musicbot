const SlashCommand = require("../../lib/SlashCommand");
const {
  EmbedBuilder
} = require("discord.js");
const {
  t
} = require("../../util/i18n");
const command = new SlashCommand().setName("summon").setDescription(t("summon.auto_252")).setRun(async (client, interaction, options) => {
  let channel = await client.getChannel(client, interaction);
  if (!interaction.member.voice.channel) {
    const joinEmbed = new EmbedBuilder().setColor(client.config.embedColor).setDescription(t("summon.auto_253"));
    return interaction.reply({
      ephemeral: true,
      embeds: [joinEmbed],
      ephemeral: true
    });
  }
  let node = await client.getLavalink(client);
  if (!node) {
    return interaction.reply({
      ephemeral: true,
      embeds: [client.ErrorEmbed(t("common.noLavalink"))]
    });
  }
  let player = client.manager.getPlayer(interaction.guild.id);
  if (!player) {
    player = client.createPlayer(interaction.channel, channel, node);
    await player.connect();
  }
  if (channel.id !== player.voiceChannelId) {
    player.setVoiceChannel(channel.id);
    player.connect();
  }
  interaction.reply({
    ephemeral: true,
    embeds: [client.Embed(t("summon.auto_254", {
      var1: channel.id
    }))]
  });
});
module.exports = command;