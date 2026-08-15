const SlashCommand = require("../../lib/SlashCommand");
const {
  EmbedBuilder,
  ButtonBuilder,
  ActionRowBuilder,
  ButtonStyle
} = require("discord.js");
const {
  t
} = require("../../util/i18n");
const {
  escapeMarkdown
} = require('discord.js');
const load = require("lodash");
const pms = require("pretty-ms");
const truncate = (str, max) => str.length > max ? str.slice(0, max) + '...' : str;
const command = new SlashCommand().setName("queue").setDescription(t("queue.auto_169")).setRun(async (client, interaction, options) => {
  let channel = await client.getChannel(client, interaction);
  if (!channel) {
    return;
  }
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
      embeds: [new EmbedBuilder().setColor(0xFF0000).setDescription(t("player.noSongsInQueue"))],
      ephemeral: true
    });
  }
  if (!player.playing) {
    const queueEmbed = new EmbedBuilder().setColor(client.config.embedColor).setDescription(t("common.noSongPlaying"));
    return interaction.reply({
      embeds: [queueEmbed],
      ephemeral: true
    });
  }
  if (!player.queue.tracks.length || player.queue.tracks.length === 0) {
    let song = player.queue.current;
    var title = escapeMarkdown(song.info.title);
    title = title.replace(/\]/g, "");
    title = title.replace(/\[/g, "");
    const queueEmbed = new EmbedBuilder().setColor(client.config.embedColor).setDescription(t("queue.auto_170", {
      var1: title,
      var2: song.info.uri
    })).addFields({
      name: t("player.duration"),
      value: song.info.isStream ? `\`LIVE\`` : `\`${pms(player.position, {
        colonNotation: true
      })} / ${pms(song.info.duration, {
        colonNotation: true
      })}\``,
      inline: true
    }, {
      name: t("queue.auto_171"),
      value: `\`${player.volume}\``,
      inline: true
    }, {
      name: t("queue.auto_172"),
      value: `\`${player.queue.tracks.length}\``,
      colonNotation: true,
      inline: true
    });
    return interaction.reply({
      embeds: [queueEmbed],
      ephemeral: true
    });
  }
  await interaction.deferReply().catch(() => {});
  let queueDuration = player.queue.tracks.reduce((a, t) => a + (t.info.duration || 0), 0);
  // Don't count streams in total duration
  for (let i = 0; i < player.queue.tracks.length; i++) {
    if (player.queue.tracks[i].info.isStream) {
      queueDuration -= player.queue.tracks[i].info.duration;
    }
  }
  const mapping = player.queue.tracks.map((t, i) => `\` ${i + 1} \` [${truncate(t.info.title, 35)}](${t.info.uri}) [${t.requester ? `<@${t.requester.id || t.requester}>` : 'Unknown'}]`);
  const chunk = load.chunk(mapping, 10);
  const pages = chunk.map(s => s.join("\n"));
  let page = interaction.options.getNumber("page");
  if (!page) {
    page = 0;
  }
  if (page) {
    page = page - 1;
  }
  if (page > pages.length) {
    page = 0;
  }
  if (page < 0) {
    page = 0;
  }
  if (player.queue.tracks.length < 11) {
    let song = player.queue.current;
    var title = escapeMarkdown(song.info.title);
    title = title.replace(/\]/g, "");
    title = title.replace(/\[/g, "");
    const embedTwo = new EmbedBuilder().setColor(client.config.embedColor).setDescription(t("queue.auto_173", {
      var1: title,
      var2: song.info.uri,
      var3: song.requester ? `<@${song.requester.id || song.requester}>` : 'Unknown',
      var4: pages[page]
    })).addFields({
      name: t("queue.auto_174"),
      value: song.info.isStream ? `\`LIVE\`` : `\`${pms(player.position, {
        colonNotation: true
      })} / ${pms(song.info.duration, {
        colonNotation: true
      })}\``,
      inline: true
    }, {
      name: t("queue.auto_175"),
      value: `\`${pms(queueDuration, {
        colonNotation: true
      })}\``,
      inline: true
    }, {
      name: t("queue.auto_176"),
      value: `\`${player.queue.tracks.length}\``,
      colonNotation: true,
      inline: true
    }).setFooter({
      text: `Trang ${page + 1}/${pages.length}`
    });
    const closeButton = new ButtonBuilder().setCustomId("queue_cmd_but_close_app").setEmoji("❌").setStyle(ButtonStyle.Secondary);
    await interaction.editReply({
      embeds: [embedTwo],
      components: [new ActionRowBuilder().addComponents(closeButton)]
    }).catch(() => {});
    const shortCollector = interaction.channel.createMessageComponentCollector({
      filter: b => b.user.id === interaction.user.id,
      time: 60000 * 10,
      idle: 30e3
    });
    shortCollector.on("collect", async button => {
      if (button.customId === "queue_cmd_but_close_app") {
        shortCollector.stop();
        await button.deferUpdate().catch(() => {});
        await interaction.deleteReply().catch(() => {});
      }
    });
    shortCollector.on("end", () => {
      interaction.deleteReply().catch(() => {});
    });
  } else {
    let song = player.queue.current;
    var title = escapeMarkdown(song.info.title);
    title = title.replace(/\]/g, "");
    title = title.replace(/\[/g, "");
    const embedThree = new EmbedBuilder().setColor(client.config.embedColor).setDescription(t("queue.auto_177", {
      var1: title,
      var2: song.info.uri,
      var3: song.requester ? `<@${song.requester.id || song.requester}>` : 'Unknown',
      var4: pages[page]
    })).addFields({
      name: t("queue.auto_178"),
      value: song.info.isStream ? `\`LIVE\`` : `\`${pms(player.position, {
        colonNotation: true
      })} / ${pms(song.info.duration, {
        colonNotation: true
      })}\``,
      inline: true
    }, {
      name: t("queue.auto_179"),
      value: `\`${pms(queueDuration, {
        colonNotation: true
      })}\``,
      inline: true
    }, {
      name: t("queue.auto_180"),
      value: `\`${player.queue.tracks.length}\``,
      colonNotation: true,
      inline: true
    }).setFooter({
      text: `Trang ${page + 1}/${pages.length}`
    });
    const buttonOne = new ButtonBuilder().setCustomId("queue_cmd_but_1_app").setEmoji("⏭️").setStyle(ButtonStyle.Primary);
    const buttonTwo = new ButtonBuilder().setCustomId("queue_cmd_but_2_app").setEmoji("⏮️").setStyle(ButtonStyle.Primary);
    const buttonClose = new ButtonBuilder().setCustomId("queue_cmd_but_close_app").setEmoji("❌").setStyle(ButtonStyle.Secondary);
    await interaction.editReply({
      embeds: [embedThree],
      components: [new ActionRowBuilder().addComponents(buttonTwo, buttonOne, buttonClose)]
    }).catch(() => {});
    const collector = interaction.channel.createMessageComponentCollector({
      filter: b => {
        if (b.user.id === interaction.user.id) {
          return true;
        } else {
          return b.reply({
            content: t("player.onlyUserCanUse", {
              user: interaction.user.tag
            }),
            ephemeral: true
          }).catch(() => {});
        }
      },
      time: 60000 * 10,
      idle: 30e3
    });
    collector.on("collect", async button => {
      if (button.customId === "queue_cmd_but_close_app") {
        collector.stop();
        await button.deferUpdate().catch(() => {});
        await interaction.deleteReply().catch(() => {});
        return;
      } else if (button.customId === "queue_cmd_but_1_app") {
        await button.deferUpdate().catch(() => {});
        page = page + 1 < pages.length ? ++page : 0;
        let song = player.queue.current;
        var title = escapeMarkdown(song.info.title);
        title = title.replace(/\]/g, "");
        title = title.replace(/\[/g, "");
        const embedFour = new EmbedBuilder().setColor(client.config.embedColor).setDescription(t("queue.auto_181", {
          var1: title,
          var2: song.info.uri,
          var3: song.requester ? `<@${song.requester.id || song.requester}>` : 'Unknown',
          var4: pages[page]
        })).addFields({
          name: t("queue.auto_182"),
          value: song.info.isStream ? `\`LIVE\`` : `\`${pms(player.position, {
            colonNotation: true
          })} / ${pms(song.info.duration, {
            colonNotation: true
          })}\``,
          inline: true
        }, {
          name: t("queue.auto_183"),
          value: `\`${pms(queueDuration, {
            colonNotation: true
          })}\``,
          inline: true
        }, {
          name: t("queue.auto_184"),
          value: `\`${player.queue.tracks.length}\``,
          colonNotation: true,
          inline: true
        }).setFooter({
          text: `Trang ${page + 1}/${pages.length}`
        });
        await interaction.editReply({
          embeds: [embedFour],
          components: [new ActionRowBuilder().addComponents(buttonTwo, buttonOne, buttonClose)]
        });
      } else if (button.customId === "queue_cmd_but_2_app") {
        await button.deferUpdate().catch(() => {});
        page = page > 0 ? --page : pages.length - 1;
        let song = player.queue.current;
        var title = escapeMarkdown(song.info.title);
        title = title.replace(/\]/g, "");
        title = title.replace(/\[/g, "");
        const embedFive = new EmbedBuilder().setColor(client.config.embedColor).setDescription(t("queue.auto_185", {
          var1: title,
          var2: song.info.uri,
          var3: song.requester ? `<@${song.requester.id || song.requester}>` : 'Unknown',
          var4: pages[page]
        })).addFields({
          name: t("queue.auto_186"),
          value: song.info.isStream ? `\`LIVE\`` : `\`${pms(player.position, {
            colonNotation: true
          })} / ${pms(song.info.duration, {
            colonNotation: true
          })}\``,
          inline: true
        }, {
          name: t("queue.auto_187"),
          value: `\`${pms(queueDuration, {
            colonNotation: true
          })}\``,
          inline: true
        }, {
          name: t("queue.auto_188"),
          value: `\`${player.queue.tracks.length}\``,
          colonNotation: true,
          inline: true
        }).setFooter({
          text: `Trang ${page + 1}/${pages.length}`
        });
        await interaction.editReply({
          embeds: [embedFive],
          components: [new ActionRowBuilder().addComponents(buttonTwo, buttonOne, buttonClose)]
        }).catch(() => {});
      }
    });
    collector.on("end", () => {
      interaction.deleteReply().catch(() => {});
    });
  }
});
module.exports = command;