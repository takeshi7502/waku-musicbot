const { EmbedBuilder } = require("discord.js");

const EMPTY_CHANNEL_TIMER_KEY = "emptyChannelDisconnectTimer";

function getAutoSetting(client, player, key) {
  const value = player.get(key);
  return typeof value === "boolean" ? value : Boolean(client.config[key]);
}

function getVoiceChannel(client, player) {
  const guild = client.guilds.cache.get(player.guildId);
  return (
    guild?.channels.cache.get(player.voiceChannelId) ||
    client.channels.cache.get(player.voiceChannelId) ||
    null
  );
}

function getHumanMemberCount(channel) {
  if (!channel?.members?.filter) return 0;
  return channel.members.filter((member) => !member.user.bot).size;
}

function shouldLeaveWhenEmpty(client, player) {
  return (
    getAutoSetting(client, player, "autoLeave") ||
    !getAutoSetting(client, player, "twentyFourSeven")
  );
}

function clearEmptyChannelLeaveTimer(player) {
  const timer = player.get(EMPTY_CHANNEL_TIMER_KEY);
  if (timer) clearTimeout(timer);
  player.set(EMPTY_CHANNEL_TIMER_KEY, null);
}

async function deleteNowPlayingMessage(client, player) {
  const message = player.get("nowPlayingMessage");
  const wasDeleted = client.isMessageDeleted?.(message);
  if (message && !wasDeleted) {
    await message.delete().catch(() => {});
    client.markMessageAsDeleted?.(message);
  }
  player.set("nowPlayingMessage", null);
}

async function leaveEmptyVoiceChannel(client, player) {
  const channel = getVoiceChannel(client, player);
  if (
    !player.connected ||
    getHumanMemberCount(channel) > 0 ||
    !shouldLeaveWhenEmpty(client, player)
  ) {
    return false;
  }

  clearEmptyChannelLeaveTimer(player);
  await deleteNowPlayingMessage(client, player);

  const textChannel = client.channels.cache.get(player.textChannelId);
  if (textChannel) {
    const embed = new EmbedBuilder()
      .setColor(client.config.embedColor)
      .setAuthor({
        name: client.translateGuild(player.guildId, "voice.disconnected"),
      })
      .setFooter({
        text: client.translateGuild(player.guildId, "voice.disconnectedNoMembers"),
      })
      .setTimestamp();
    const message = await textChannel.send({ embeds: [embed] }).catch(() => null);
    if (message) setTimeout(() => message.delete().catch(() => {}), 5000);
  }

  const pausedMessage = player.get("pausedMessage");
  if (pausedMessage && !client.isMessageDeleted?.(pausedMessage)) {
    await pausedMessage.delete().catch(() => {});
    client.markMessageAsDeleted?.(pausedMessage);
  }

  player.queue?.tracks?.splice?.(0);
  player.set("autoQueue", false);
  player.set("pausedByAutoPause", false);
  await player.destroy().catch(() => {});
  return true;
}

function reconcileAutoLeave(client, player) {
  const channel = getVoiceChannel(client, player);
  if (
    !player.connected ||
    getHumanMemberCount(channel) > 0 ||
    !shouldLeaveWhenEmpty(client, player)
  ) {
    clearEmptyChannelLeaveTimer(player);
    return false;
  }

  if (player.get(EMPTY_CHANNEL_TIMER_KEY)) return true;

  const delay = Math.max(0, Number(client.config.disconnectTime) || 0);
  const timer = setTimeout(async () => {
    player.set(EMPTY_CHANNEL_TIMER_KEY, null);
    await leaveEmptyVoiceChannel(client, player);
  }, delay);
  player.set(EMPTY_CHANNEL_TIMER_KEY, timer);
  return true;
}

module.exports = {
  clearEmptyChannelLeaveTimer,
  getAutoSetting,
  getHumanMemberCount,
  getVoiceChannel,
  reconcileAutoLeave,
  shouldLeaveWhenEmpty,
};
