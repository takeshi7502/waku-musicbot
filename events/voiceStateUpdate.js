const { EmbedBuilder } = require("discord.js");
const { t } = require("../util/i18n");
const {
  clearEmptyChannelLeaveTimer,
  getAutoSetting,
  getHumanMemberCount,
  reconcileAutoLeave,
} = require("../util/autoVoiceLeave");

async function deleteMessage(client, message) {
  if (!message || client.isMessageDeleted?.(message)) return;
  await message.delete().catch(() => {});
  client.markMessageAsDeleted?.(message);
}

async function sendAutoPauseMessage(client, player) {
  const textChannel = client.channels.cache.get(player.textChannelId);
  if (!textChannel) return;

  const pausedMessage = await textChannel
    .send({
      embeds: [
        new EmbedBuilder()
          .setColor(client.config.embedColor)
          .setTitle(t("voiceStateUpdate.auto_286"))
          .setFooter({ text: t("voiceStateUpdate.auto_287") }),
      ],
    })
    .catch(() => null);
  if (pausedMessage) player.set("pausedMessage", pausedMessage);
  await deleteMessage(client, player.get("resumeMessage"));
}

async function sendAutoResumeMessage(client, player) {
  const textChannel = client.channels.cache.get(player.textChannelId);
  const track = player.queue?.current;
  if (!textChannel || !track) return;

  const resumeMessage = await textChannel
    .send({
      embeds: [
        new EmbedBuilder()
          .setColor(client.config.embedColor)
          .setTitle(t("voiceStateUpdate.auto_284"))
          .setDescription(
            t("voice.currentlyPlaying", {
              title: track.info.title,
              url: track.info.uri,
            })
          )
          .setFooter({ text: t("voiceStateUpdate.auto_285") }),
      ],
    })
    .catch(() => null);
  if (resumeMessage) {
    player.set("resumeMessage", resumeMessage);
    setTimeout(() => deleteMessage(client, resumeMessage), 5000);
  }
  await deleteMessage(client, player.get("pausedMessage"));
}

/**
 * Keeps auto-pause and auto-leave independent:
 * - autoPause controls pause/resume only.
 * - autoLeave, or disabled 24/7, controls whether an empty channel gets a leave timer.
 */
module.exports = async (client, oldState, newState) => {
  const guildId = newState.guild.id;
  return client.withGuildLanguage(guildId, async () => {
    const player = client.manager.getPlayer(guildId);
    if (!player || !player.connected) return;

    if (
      newState.id === client.config.clientId &&
      newState.serverMute === true &&
      oldState.serverMute === false
    ) {
      player.set("pausedByAutoPause", false);
      return player.pause();
    }
    if (
      newState.id === client.config.clientId &&
      newState.serverMute === false &&
      oldState.serverMute === true
    ) {
      player.set("pausedByAutoPause", false);
      return player.resume();
    }

    let type = null;
    let channel = null;
    if (oldState.channel === null && newState.channel !== null) {
      type = "JOIN";
      channel = newState.channel;
    } else if (oldState.channel !== null && newState.channel === null) {
      type = "LEAVE";
      channel = oldState.channel;
    } else if (oldState.channel !== null && newState.channel !== null) {
      if (oldState.channel.id === player.voiceChannelId) {
        type = "LEAVE";
        channel = oldState.channel;
      }
      if (newState.channel.id === player.voiceChannelId) {
        type = "JOIN";
        channel = newState.channel;
      }
    }

    if (!type || !channel || channel.id !== player.voiceChannelId) return;

    player.prevMembers = player.members;
    player.members = getHumanMemberCount(channel);

    if (type === "JOIN") {
      clearEmptyChannelLeaveTimer(player);
      if (
        player.members > 0 &&
        getAutoSetting(client, player, "autoPause") &&
        player.paused &&
        player.get("pausedByAutoPause")
      ) {
        await player.resume();
        player.set("pausedByAutoPause", false);
        await sendAutoResumeMessage(client, player);
      }
      return;
    }

    if (player.members > 0) return;

    if (
      getAutoSetting(client, player, "autoPause") &&
      player.playing &&
      !player.paused
    ) {
      await player.pause();
      player.set("pausedByAutoPause", true);
      await sendAutoPauseMessage(client, player);
    }

    reconcileAutoLeave(client, player);
  });
};
