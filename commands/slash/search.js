const {
  t
} = require("../../util/i18n");
const SlashCommand = require("../../lib/SlashCommand");
const prettyMilliseconds = require("pretty-ms");
const {
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder
} = require("discord.js");
const command = new SlashCommand().setName("search").setDescription(t("search.auto_212")).addStringOption(option => option.setName("query").setDescription(t("search.auto_213")).setRequired(true)).setRun(async (client, interaction, options) => {
  let channel = await client.getChannel(client, interaction);
  if (!channel) {
    return;
  }
  let node = await client.getLavalink(client);
  if (!node) {
    return interaction.reply({
      embeds: [new EmbedBuilder().setColor(0xFF0000).setDescription(t("common.noLavalink"))],
      ephemeral: true
    });
  }
  let player;
  if (client.manager) {
    player = client.manager.getPlayer(interaction.guild.id);
    if (!player) {
      player = client.createPlayer(interaction.channel, channel, node);
    }
  } else {
    return interaction.reply({
      embeds: [new EmbedBuilder().setColor(0xFF0000).setDescription(t("common.noLavalink"))],
      ephemeral: true
    });
  }
  await interaction.deferReply().catch(_ => {});
  if (!player.connected) {
    await player.connect();
  }
  const search = interaction.options.getString("query");
  let res;
  try {
    res = await player.search({
      query: search,
      source: "youtube"
    }, interaction.user);
    if (res.loadType === "error") {
      return interaction.editReply({
        embeds: [new EmbedBuilder().setDescription(t("search.searchError")).setColor(0xFF0000)]
      });
    }
  } catch (err) {
    return interaction.editReply({
      embeds: [new EmbedBuilder().setAuthor({
        name: t("search.auto_214")
      }).setColor(0xFF0000)]
    });
  }
  if (res.loadType === "empty") {
    return interaction.editReply({
      embeds: [new EmbedBuilder().setDescription(t("search.noResultsFor", {
        query
      })).setColor(0xFF0000)]
    });
  } else {
    let max = 10;
    if (res.tracks.length < max) {
      max = res.tracks.length;
    }
    let resultFromSearch = [];
    res.tracks.slice(0, max).map(track => {
      resultFromSearch.push({
        label: `${track.info.title}`.substring(0, 100),
        value: `${track.info.uri}`,
        description: track.info.isStream ? `LIVE` : `${prettyMilliseconds(track.info.duration, {
          secondsDecimalDigits: 0
        })} - ${track.info.author}`
      });
    });
    const menus = new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId("select").setPlaceholder(t("search.auto_215")).addOptions(resultFromSearch));
    let choosenTracks = await interaction.editReply({
      embeds: [new EmbedBuilder().setColor(client.config.embedColor).setDescription(t("search.auto_216", {
        var1: search
      }))],
      components: [menus]
    });
    const filter = button => button.user.id === interaction.user.id;
    const tracksCollector = choosenTracks.createMessageComponentCollector({
      filter,
      time: 30000
    });
    tracksCollector.on("collect", async i => {
      if (i.isStringSelectMenu()) {
        await i.deferUpdate();
        let uriFromCollector = i.values[0];
        let trackForPlay;
        trackForPlay = await player?.search({
          query: uriFromCollector
        }, interaction.user);
        await player?.queue?.add(trackForPlay.tracks[0]);
        if (!player?.playing && !player?.paused && player?.queue?.tracks?.length > 0) {
          await player?.play({
            paused: false
          });
        }
        i.editReply({
          content: null,
          embeds: [new EmbedBuilder().setAuthor({
            name: t("search.auto_217"),
            iconURL: client.config.iconURL
          }).setURL(trackForPlay.tracks[0].info.uri).setThumbnail(trackForPlay.tracks[0].info.artworkUrl || null).setDescription(`[${trackForPlay?.tracks[0]?.info?.title}](${trackForPlay?.tracks[0]?.info?.uri})` || t("search.auto_218")).addFields({
            name: t("search.auto_219"),
            value: `<@${interaction.user.id}>`,
            inline: true
          }, {
            name: t("player.duration"),
            value: trackForPlay.tracks[0].info.isStream ? `\`LIVE :red_circle:\`` : `\`${client.ms(trackForPlay.tracks[0].info.duration, {
              colonNotation: true
            })}\``,
            inline: true
          }).setColor(client.config.embedColor)],
          components: []
        });
      }
    });
    tracksCollector.on("end", async i => {
      if (i.size == 0) {
        choosenTracks.edit({
          content: null,
          embeds: [new EmbedBuilder().setDescription(t("search.auto_220")).setColor(client.config.embedColor)],
          components: []
        });
      }
    });
  }
});
module.exports = command;