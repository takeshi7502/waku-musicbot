const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder
} = require("discord.js");
const {
  t,
  translate,
  DEFAULT_LANGUAGE
} = require("./i18n");
const {
  buildNowPlayingEmbed,
  markNowPlayingUserAction,
  queueNowPlayingMessageEdit,
  refreshNowPlayingPanel
} = require("./nowPlayingEmbed");

const AUTO_SETTINGS = [
  { key: "twentyFourSeven", configKey: "twentyFourSeven", label: "247", descriptionKey: "Controller.auto247Description" },
  { key: "autoLeave", configKey: "autoLeave", label: "autoleave", descriptionKey: "Controller.autoLeaveDescription" },
  { key: "autoPause", configKey: "autoPause", label: "autopause", descriptionKey: "Controller.autoPauseDescription" },
  { key: "autoQueue", configKey: "autoQueue", label: "autoqueue", descriptionKey: "Controller.autoQueueDescription" }
];

async function refreshNowPlayingMessage(client, interaction, player, includeEmbed = false) {
  if (!interaction.message) return;

  const payload = {
    components: client.createController(player.guildId, player)
  };
  if (includeEmbed && player.queue.current) {
    payload.embeds = [buildNowPlayingEmbed(client, player, player.queue.current)];
  }

  await queueNowPlayingMessageEdit(player, interaction.message, payload).catch(() => {});
}

function getAutoSettingEnabled(client, player, setting) {
  const value = player.get(setting.key);
  return typeof value === "boolean" ? value : Boolean(client.config[setting.configKey]);
}

function buildAutoSettingsEmbed(client, guildId) {
  const settingLines = AUTO_SETTINGS.map(setting =>
    `\`${setting.label}\` — ${client.translateGuild(guildId, setting.descriptionKey)}`
  );

  return new EmbedBuilder()
    .setColor(client.config.embedColor)
    .setTitle(client.translateGuild(guildId, "Controller.autoMenuTitle"))
    .setDescription([
      client.translateGuild(guildId, "Controller.autoMenuDescription"),
      ...settingLines
    ].join("\n"));
}

function buildAutoSettingsComponents(client, guildId, player) {
  const buttons = AUTO_SETTINGS.map(setting => new ButtonBuilder()
    .setCustomId(`auto-settings:${guildId}:${setting.key}`)
    .setLabel(setting.label)
    .setStyle(getAutoSettingEnabled(client, player, setting) ? ButtonStyle.Success : ButtonStyle.Danger));

  return [new ActionRowBuilder().addComponents(buttons)];
}

async function openAutoSettingsMenu(client, interaction, player) {
  const guildId = interaction.guildId;
  await interaction.reply({
    ephemeral: true,
    embeds: [buildAutoSettingsEmbed(client, guildId)],
    components: buildAutoSettingsComponents(client, guildId, player)
  });

  const menuMessage = await interaction.fetchReply().catch(() => null);
  if (!menuMessage) return;

  const collector = menuMessage.createMessageComponentCollector({
    time: 60_000,
    filter: menuInteraction => menuInteraction.user.id === interaction.user.id && menuInteraction.customId.startsWith(`auto-settings:${guildId}:`)
  });

  collector.on("collect", async menuInteraction => {
    const settingKey = menuInteraction.customId.split(":")[2];
    const setting = AUTO_SETTINGS.find(item => item.key === settingKey);
    const activePlayer = client.manager.getPlayer(guildId);

    if (!setting || !activePlayer) {
      collector.stop();
      await menuInteraction.deferUpdate().catch(() => {});
      return;
    }

    const enabled = !getAutoSettingEnabled(client, activePlayer, setting);
    activePlayer.set(setting.key, enabled);

    if (setting.key === "autoQueue") {
      await refreshNowPlayingPanel(client, activePlayer).catch(() => {});
    } else if (setting.key === "autoLeave" || setting.key === "autoPause") {
      activePlayer.set("requester", interaction.guild.members.me);
    }

    await menuInteraction.update({
      embeds: [buildAutoSettingsEmbed(client, guildId)],
      components: buildAutoSettingsComponents(client, guildId, activePlayer)
    }).catch(() => {});
    collector.resetTimer();
  });

  collector.on("end", () => {
    interaction.deleteReply().catch(() => {});
  });
}

/**
 *
 * @param {import("../lib/DiscordMusicBot")} client
 * @param {import("discord.js").ButtonInteraction} interaction
 */
module.exports = async (client, interaction) => {
  let guild = client.guilds.cache.get(interaction.customId.split(":")[1]);
  let property = interaction.customId.split(":")[2];
  let player = client.manager.getPlayer(guild.id);
  if (!player) {
    await interaction.reply({
      embeds: [client.Embed(t("common.noPlayer"))],
      ephemeral: true
    });
    return;
  }
  if (!interaction.member.voice.channel) {
    const joinEmbed = new EmbedBuilder().setColor(client.config.embedColor).setDescription(t("common.noPlayerVoice"));
    return interaction.reply({
      embeds: [joinEmbed],
      ephemeral: true
    });
  }
  if (interaction.guild.members.me.voice.channel && !interaction.guild.members.me.voice.channel.equals(interaction.member.voice.channel)) {
    const sameEmbed = new EmbedBuilder().setColor(client.config.embedColor).setDescription(t("common.sameVoiceRequired"));
    return await interaction.reply({
      embeds: [sameEmbed],
      ephemeral: true
    });
  }
  if (property === "AutoSettings") {
    return openAutoSettingsMenu(client, interaction, player);
  }
  if (property === "Stop") {
    markNowPlayingUserAction(player);
    await interaction.deferUpdate().catch(() => {});
    player.queue.tracks.splice(0);
    player.set("autoQueue", false);
    player.set("stoppedByUser", true);
    player.stopPlaying(false, false);
    client.warn(translate(DEFAULT_LANGUAGE, "Controller.auto_290", {
      var1: player.guildId
    }));
    return;
  }

  // if theres no previous song, return an error.
  if (property === "Replay") {
    const previousSongs = player.queue.previous;
    const previousSong = previousSongs && previousSongs.length > 0 ? previousSongs[0] : null;
    const currentSong = player.queue.current;
    const nextSong = player.queue.tracks[0];
    if (!previousSong || previousSong === currentSong || previousSong === nextSong) {
      return interaction.reply({
        ephemeral: true,
        embeds: [new EmbedBuilder().setColor(0xFF0000).setDescription(t("Controller.auto_291"))]
      });
    }
    if (previousSong !== currentSong && previousSong !== nextSong) {
      markNowPlayingUserAction(player);
      await interaction.deferUpdate().catch(() => {});
      player.queue.tracks.splice(0, 0, currentSong);
      player.play({
        clientTrack: previousSong
      });
      return;
    }
  }
  if (property === "PlayAndPause") {
    if (!player || !player.queue.current) {
      const msg = await interaction.channel.send({
        embeds: [new EmbedBuilder().setColor(0xFF0000).setDescription(t("common.noCurrentSong"))]
      });
      setTimeout(() => {
        msg.delete().catch(() => {});
      }, 5000);
      return interaction.deferUpdate().catch(() => {});
    } else {
      markNowPlayingUserAction(player);
      await interaction.deferUpdate().catch(() => {});
      if (player.paused) {
        player.resume();
      } else {
        player.pause();
      }
    client.warn(translate(DEFAULT_LANGUAGE, "Controller.auto_292", {
        var1: player.guildId,
        var2: player.paused ? "Tạm dừng" : "Tiếp tục"
      }));
      return refreshNowPlayingMessage(client, interaction, player, true);
    }
  }
  if (property === "Next") {
    const song = player.queue.current;
    const autoQueue = player.get("autoQueue");
    if (player.queue.tracks.length === 0 && (!autoQueue || autoQueue === false)) {
      return interaction.reply({
        ephemeral: true,
        embeds: [new EmbedBuilder().setColor(0xFF0000).setDescription(t("player.nothingAfterSkip", {
          title: song.info.title,
          url: song.info.uri
        }))]
      });
    } else {
      markNowPlayingUserAction(player);
      await interaction.deferUpdate().catch(() => {});
      player.stopPlaying(false, false);
      return;
    }
  }
  if (property === "Loop") {
    markNowPlayingUserAction(player);
    await interaction.deferUpdate().catch(() => {});
    if (player.repeatMode === "track") {
      player.setRepeatMode("queue");
    } else if (player.repeatMode === "queue") {
      player.setRepeatMode("off");
    } else {
      player.setRepeatMode("track");
    }
    client.warn(translate(DEFAULT_LANGUAGE, "Controller.auto_293", {
      var1: player.guildId,
      var2: player.repeatMode === "track" ? "bài hát" : player.repeatMode === "queue" ? "hàng đợi" : "tất cả"
    }));
    return refreshNowPlayingMessage(client, interaction, player, true);
  }
  if (property === "SelectQueue") {
    const selectedValue = interaction.values?.[0]; // "queuejump:2"
    if (!selectedValue) return interaction.deferUpdate().catch(() => {});
    const index = parseInt(selectedValue.split(":")[1], 10);
    if (isNaN(index) || index < 0 || index >= player.queue.tracks.length) {
      return interaction.reply({
        ephemeral: true,
        embeds: [new EmbedBuilder().setColor(0xFF0000).setDescription("❌ Bài hát này không còn trong hàng đợi!")]
      });
    }
    // Xóa các bài phía trước bài được chọn, sau đó chạy bài tiếp theo
    markNowPlayingUserAction(player);
    await interaction.deferUpdate().catch(() => {});
    player.queue.splice(0, index);
    player.stopPlaying(false, false);
    return;
  }
  if (property === "Save") {
    const song = player.queue.current;
    if (!song) {
      return interaction.reply({
        ephemeral: true,
        embeds: [new EmbedBuilder().setColor(0xFF0000).setDescription(t("common.noSongPlaying"))]
      });
    }
    const prettyMilliseconds = require("pretty-ms");
    const embedColor = client.config.embedColor || 0x5865F2;
    const sendtoDmEmbed = new EmbedBuilder()
      .setColor(embedColor)
      .setAuthor({
        name: t("save.auto_206"),
        iconURL: interaction.user.displayAvatarURL({ dynamic: true })
      })
      .setDescription(t("save.auto_207", {
        var1: song.info.title,
        var2: song.info.uri
      }))
      .addFields(
        { name: t("save.auto_208"), value: `\`${prettyMilliseconds(song.info.duration, { colonNotation: true })}\``, inline: true },
        { name: t("save.auto_209"), value: `\`${song.info.author}\``, inline: true },
        { name: t("save.auto_210"), value: `\`${interaction.guild.name}\``, inline: true }
      );
    interaction.user.send({ embeds: [sendtoDmEmbed] }).catch(() => {});
    return interaction.reply({
      ephemeral: true,
      embeds: [new EmbedBuilder().setColor(embedColor).setDescription(t("save.auto_211"))]
    });
  }
  return interaction.reply({
    ephemeral: true,
    content: t("common.unknownControl")
  });
};
