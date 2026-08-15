const { t } = require("../../util/i18n");
const SlashCommand = require("../../lib/SlashCommand");
const moment = require("moment");
require("moment-duration-format");
const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} = require("discord.js");
function buildStatusEmbed(client, autoMode) {
  const runtime = moment.duration(client.uptime).format("D[d]・H[h]・m[m]・s[s]", {
    trim: "all"
  });
  const allPlayers = [...client.manager.players.values()];
  const playingBotPlayers = allPlayers.filter(p => p.playing && !p.paused).length;
  const pausedBotPlayers = allPlayers.filter(p => p.paused).length;
  let totalListeners = 0;
  for (const player of allPlayers) {
    try {
      const guild = client.guilds.cache.get(player.guildId);
      if (guild) {
        const vc = guild.channels.cache.get(player.voiceChannelId);
        if (vc) totalListeners += vc.members.filter(m => !m.user.bot).size;
      }
    } catch (e) {}
  }
  const botRam = (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(1);
  let desc = t("status.auto_240");
  desc += `**Bot ${client.user.username}**\n`;
  desc += `**• Ping:** ${client.ws.ping}ms **• Servers:** ${client.guilds.cache.size}\n`;
  desc += `**• Playing:** \`${playingBotPlayers}\` | **Paused:** \`${pausedBotPlayers}\`\n`;
  desc += `**• Listening:** \`${totalListeners}\`\n`;
  desc += `**• RAM:** ${botRam}MB\n`;
  desc += `**• Uptime:** ${runtime}\n`;
  const nodes = [...client.manager.nodeManager.nodes.values()];
  if (nodes.length === 0) {
    desc += t("status.auto_241");
  } else {
    for (const node of nodes) {
      const isConnected = node.connected;
      const icon = isConnected ? ":green_circle:" : ":red_circle:";
      const h = node.options?.host || "N/A";
      const p = node.options?.port || "N/A";
      const playersOnThisNode = allPlayers.filter(pl => pl.node?.id === node.id && pl.playing).length;
      desc += `\n${icon} **${node.id || "Node"}** (Playing: \`${playersOnThisNode}\`)\n`;
      desc += `**• Host:** \`${h}:${p}\`\n`;
      desc += `**• Status:** ${isConnected ? t("status.auto_242") : t("status.auto_243")}\n`;
      if (isConnected && node.stats) {
        const lavauptime = moment.duration(node.stats.uptime).format("D[d]・H[h]・m[m]・s[s]", {
          trim: "all"
        });
        const lavaramUsed = (node.stats.memory.used / 1024 / 1024).toFixed(1);
        const lavaramAlloc = (node.stats.memory.allocated / 1024 / 1024).toFixed(1);
        const cpuLoad = ((node.stats.cpu?.lavalinkLoad || 0) * 100).toFixed(1);
        desc += `**• Players:** ${node.stats.playingPlayers}/${node.stats.players} (chung node)\n`;
        desc += `**• RAM:** ${lavaramUsed}MB / ${lavaramAlloc}MB **• CPU:** ${cpuLoad}%\n`;
        desc += `**• Uptime:** ${lavauptime}\n`;
      }
    }
  }
  const now = new Date();
  const timeStr = now.toLocaleTimeString("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  });
  const footerText = autoMode ? t("status.auto_244", {
    var1: timeStr
  }) : t("status.auto_245", {
    var1: timeStr
  });
  return new EmbedBuilder().setColor(client.config.embedColor).setDescription(desc).setTimestamp().setFooter({
    text: footerText
  });
}

// Nút mặc định: chỉ có "Auto Làm mới"
function defaultRow() {
  return new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId("status_auto").setLabel(t("status.auto_246")).setStyle(ButtonStyle.Primary));
}

// Nút khi đang auto: chỉ có "Tắt Auto"
function autoRow() {
  return new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId("status_stop").setLabel(t("status.auto_247")).setStyle(ButtonStyle.Danger));
}
const command = new SlashCommand().setName("status").setDescription(t("status.auto_248")).setAdminOnly(true).setRun(async (client, interaction) => {
  // Nếu có session cũ đang báo auto, dừng nó lại
  if (client._statusSession) {
    client._statusSession.stop();
    client._statusSession = null;
  }
  await interaction.reply({
    embeds: [buildStatusEmbed(client, false)],
    components: [defaultRow()],
    ephemeral: true
  });
  let autoInterval = null;
  let autoTimeout = null;
  function stopAuto() {
    if (autoInterval) {
      clearInterval(autoInterval);
      autoInterval = null;
    }
    if (autoTimeout) {
      clearTimeout(autoTimeout);
      autoTimeout = null;
    }
  }

  // Lưu session để /status mới có thể tắt cái cũ
  client._statusSession = {
    stop: () => {
      stopAuto();
      if (collector) collector.stop();
    }
  };
  const collector = interaction.channel?.createMessageComponentCollector?.({
    filter: btn => ["status_auto", "status_stop"].includes(btn.customId) && btn.user.id === interaction.user.id,
    time: 600000
  });
  if (!collector) return;
  collector.on("collect", async btn => {
    if (btn.customId === "status_auto") {
      stopAuto();
      await btn.update({
        embeds: [buildStatusEmbed(client, true)],
        components: [autoRow()]
      }).catch(() => {});
      autoInterval = setInterval(async () => {
        try {
          await interaction.editReply({
            embeds: [buildStatusEmbed(client, true)],
            components: [autoRow()]
          });
        } catch (e) {
          stopAuto();
        }
      }, 5000);
      autoTimeout = setTimeout(async () => {
        stopAuto();
        try {
          await interaction.editReply({
            embeds: [buildStatusEmbed(client, false)],
            components: [defaultRow()]
          });
        } catch (e) {}
      }, 300000);
    } else if (btn.customId === "status_stop") {
      stopAuto();
      await btn.update({
        embeds: [buildStatusEmbed(client, false)],
        components: [defaultRow()]
      }).catch(() => {});
    }
  });
  collector.on("end", () => {
    stopAuto();
    client._statusSession = null;
    interaction.editReply({
      components: []
    }).catch(() => {});
  });
});
module.exports = command;