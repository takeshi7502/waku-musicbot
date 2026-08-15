const {
  EmbedBuilder
} = require("discord.js");
const {
  t
} = require("../../util/i18n");
const SlashCommand = require("../../lib/SlashCommand");
const {
  buildNowPlayingEmbed
} = require("../../util/nowPlayingEmbed");

const command = new SlashCommand()
  .setName("nowplaying")
  .setDescription(t("nowplaying.auto_159"))
  .setRun(async (client, interaction) => {
    const channel = await client.getChannel(client, interaction);
    if (!channel) return;

    let player;
    if (client.manager) {
      player = client.manager.getPlayer(interaction.guild.id);
    } else {
      return interaction.reply({
        embeds: [new EmbedBuilder().setColor(0xFF0000).setDescription(t("common.noLavalink"))]
      });
    }

    if (!player) {
      return interaction.reply({
        embeds: [new EmbedBuilder().setColor(0xFF0000).setDescription(t("player.notInChannel"))],
        ephemeral: true
      });
    }

    if (!player.playing) {
      return interaction.reply({
        embeds: [new EmbedBuilder().setColor(0xFF0000).setDescription(t("common.noSongPlaying"))],
        ephemeral: true
      });
    }

    const song = player.queue.current;
    const oldMsg = player.get("nowPlayingMessage");
    if (oldMsg && !client.isMessageDeleted(oldMsg)) {
      oldMsg.delete().catch(() => {});
      client.markMessageAsDeleted(oldMsg);
    }

    player.set("textChannelId", interaction.channel.id);
    const newMsg = await interaction.reply({
      embeds: [buildNowPlayingEmbed(client, player, song)],
      components: client.createController(player.guildId, player),
      fetchReply: true
    });

    if (newMsg) player.set("nowPlayingMessage", newMsg);
  });

module.exports = command;
