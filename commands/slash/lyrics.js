const {
  t
} = require("../../util/i18n");
const SlashCommand = require("../../lib/SlashCommand");
const {
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder
} = require("discord.js");
const {
  Rlyrics
} = require("rlyrics");
const lyricsApi = new Rlyrics();
const command = new SlashCommand().setName("lyrics").setDescription(t("lyrics.auto_142")).addStringOption(option => option.setName("song").setDescription(t("lyrics.auto_143")).setRequired(false)).setRun(async (client, interaction, options) => {
  await interaction.reply({
    embeds: [new EmbedBuilder().setColor(client.config.embedColor).setDescription(t("lyrics.searching"))]
  });
  let player;
  if (client.manager) {
    player = client.manager.getPlayer(interaction.guild.id);
  } else {
    return interaction.editReply({
      embeds: [new EmbedBuilder().setColor(0xFF0000).setDescription(t("common.noLavalink"))]
    });
  }
  const args = interaction.options.getString("song");
  if (!args && !player) {
    return interaction.editReply({
      embeds: [new EmbedBuilder().setColor(0xFF0000).setDescription(t("common.noSongPlaying"))]
    });
  }
  let currentTitle = ``;
  const phrasesToRemove = ["Full Video", "Full Audio", "Official Music Video", "Lyrics", "Lyrical Video", "Feat.", "Ft.", "Official", "Audio", "Video", "HD", "4K", "Remix", "Lyric Video", "Lyrics Video", "8K", "High Quality", "Animation Video", "\\(Official Video\\. .*\\)", "\\(Music Video\\. .*\\)", "\\[NCS Release\\]", "Extended", "DJ Edit", "with Lyrics", "Lyrics", "Karaoke", "Instrumental", "Live", "Acoustic", "Cover", "\\(feat\\. .*\\)"];
  if (!args) {
    currentTitle = player.queue.current.info.title;
    currentTitle = currentTitle.replace(new RegExp(phrasesToRemove.join('|'), 'gi'), '').replace(/\s*([\[\(].*?[\]\)])?\\s*(\\|.*)?\\s*(\\*.*)?$/, '');
  }
  let query = args ? args : currentTitle;
  let lyricsResults = [];
  lyricsApi.search(query).then(async lyricsData => {
    if (lyricsData.length !== 0) {
      for (let i = 0; i < client.config.lyricsMaxResults; i++) {
        if (lyricsData[i]) {
          lyricsResults.push({
            label: `${lyricsData[i].title}`.substring(0, 100),
            description: `${lyricsData[i].artist}`.substring(0, 100),
            value: i.toString()
          });
        } else {
          break;
        }
      }
      const menu = new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId("choose-lyrics").setPlaceholder(t("lyrics.auto_144")).addOptions(lyricsResults));
      let selectedLyrics = await interaction.editReply({
        embeds: [new EmbedBuilder().setColor(client.config.embedColor).setDescription(t("lyrics.auto_145", {
          var1: query
        }))],
        components: [menu]
      });
      const filter = button => button.user.id === interaction.user.id;
      const collector = selectedLyrics.createMessageComponentCollector({
        filter,
        time: 30000
      });
      collector.on("collect", async i => {
        if (i.isStringSelectMenu()) {
          await i.deferUpdate();
          const url = lyricsData[parseInt(i.values[0])].url;
          lyricsApi.find(url).then(lyrics => {
            let lyricsText = lyrics.lyrics;
            const button = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('tipsbutton').setLabel('Tips').setEmoji(`📌`).setStyle(ButtonStyle.Secondary), new ButtonBuilder().setLabel('Source').setURL(url).setStyle(ButtonStyle.Link));
            const musixmatch_icon = 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/e3/Musixmatch_logo_icon_only.svg/480px-Musixmatch_logo_icon_only.svg.png';
            let lyricsEmbed = new EmbedBuilder().setColor(client.config.embedColor).setTitle(`${lyrics.name}`).setURL(url).setThumbnail(lyrics.icon).setFooter({
              text: t("lyrics.auto_146"),
              iconURL: musixmatch_icon
            }).setDescription(lyricsText);
            if (lyricsText.length === 0) {
              lyricsEmbed.setDescription(t("lyrics.auto_147")).setFooter({
                text: t("lyrics.auto_148"),
                iconURL: musixmatch_icon
              });
            }
            if (lyricsText.length > 4096) {
              lyricsText = lyricsText.substring(0, 4050) + "\n\n[...]";
              lyricsEmbed.setDescription(lyricsText + t("lyrics.auto_149"));
            }
            return i.editReply({
              embeds: [lyricsEmbed],
              components: [button]
            });
          });
        }
      });
      collector.on("end", async collected => {
        if (collected.size == 0) {
          selectedLyrics.edit({
            content: null,
            embeds: [new EmbedBuilder().setDescription(t("lyrics.auto_150")).setColor(client.config.embedColor)],
            components: []
          });
        }
      });
    } else {
      const button = new ActionRowBuilder().addComponents(new ButtonBuilder().setEmoji(`📌`).setCustomId('tipsbutton').setLabel('Tips').setStyle(ButtonStyle.Secondary));
      return interaction.editReply({
        embeds: [new EmbedBuilder().setColor(0xFF0000).setDescription(t("search.noResultsFor", {
          query
        }))],
        components: [button]
      });
    }
  }).catch(err => {
    console.error(err);
    return interaction.editReply({
      embeds: [new EmbedBuilder().setColor(0xFF0000).setDescription(t("lyrics.auto_151"))]
    });
  });
  const tipsCollector = interaction.channel.createMessageComponentCollector({
    time: 1000 * 3600
  });
  tipsCollector.on('collect', async btnInteraction => {
    if (btnInteraction.customId === 'tipsbutton') {
      await btnInteraction.deferUpdate();
      await btnInteraction.followUp({
        embeds: [new EmbedBuilder().setTitle(t("lyrics.auto_152")).setColor(client.config.embedColor).setDescription(t("lyrics.auto_153"))],
        ephemeral: true,
        components: []
      });
    }
    ;
  });
});
module.exports = command.setName("lyrics");
module.exports.disabled = true;