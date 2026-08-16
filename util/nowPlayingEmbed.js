const { escapeMarkdown } = require("discord.js");
const { t } = require("./i18n");

const PROGRESS_SEGMENTS = 12;
const CODE_TICK = String.fromCharCode(96);

function formatTime(milliseconds) {
  const totalSeconds = Math.max(0, Math.floor((milliseconds || 0) / 1000));
  const seconds = String(totalSeconds % 60).padStart(2, "0");
  const minutes = Math.floor(totalSeconds / 60) % 60;
  const hours = Math.floor(totalSeconds / 3600);
  return hours > 0 ? String(hours) + ":" + String(minutes).padStart(2, "0") + ":" + seconds : String(minutes) + ":" + seconds;
}

function buildProgressBar(position, duration) {
  if (!duration || duration <= 0) return "▱".repeat(PROGRESS_SEGMENTS);

  const progress = Math.min(1, Math.max(0, (position || 0) / duration));
  const completed = Math.min(PROGRESS_SEGMENTS, Math.floor(progress * PROGRESS_SEGMENTS));
  return "▰".repeat(completed) + "▱".repeat(PROGRESS_SEGMENTS - completed);
}

function buildNowPlayingEmbed(client, player, track) {
  const title = escapeMarkdown(track.info.title || t("player.noDescription"))
    .replace(/\]/g, "")
    .replace(/\[/g, "");
  const requester = track.requester?.id || track.requester || client.user.id;
  const isStream = track.info.isStream;
  const totalDuration = isStream ? "LIVE" : formatTime(track.info.duration);
  const playbackIcon = player.paused ? "⏸️" : "▶️";
  const progress = isStream
    ? playbackIcon + " 🔴 LIVE"
    : playbackIcon + " " + CODE_TICK + "0:00 " + buildProgressBar(player.position, track.info.duration) + " " + totalDuration + CODE_TICK;
  const description = track.info.uri
    ? "[" + title + "](" + track.info.uri + ")\n" + progress
    : title + "\n" + progress;

  const embed = client.Embed()
    .setAuthor({
      name: t("player.nowPlaying"),
      iconURL: client.config.iconURL
    })
    .setDescription(description)
    .addFields({
      name: t("player.requestedBy"),
      value: "<@" + requester + ">",
      inline: true
    }, {
      name: t("player.duration"),
      value: CODE_TICK + totalDuration + CODE_TICK,
      inline: true
    });

  if (track.info.artworkUrl) embed.setThumbnail(track.info.artworkUrl);
  return embed;
}

function markNowPlayingUserAction(player) {
  player.set("nowPlayingUserActionUntil", Date.now() + 1500);
}

function isNowPlayingUserActionPending(player) {
  return Date.now() < (player.get("nowPlayingUserActionUntil") || 0);
}

async function queueNowPlayingMessageEdit(player, message, payload) {
  const queuedEdit = {
    message,
    payload
  };

  if (player.get("nowPlayingEditInFlight")) {
    player.set("nowPlayingPendingEdit", queuedEdit);
    return player.get("nowPlayingEditPromise");
  }

  player.set("nowPlayingEditInFlight", true);
  const editPromise = (async () => {
    let nextEdit = queuedEdit;
    let editedMessage;

    while (nextEdit) {
      player.set("nowPlayingPendingEdit", null);
      editedMessage = await nextEdit.message.edit(nextEdit.payload);
      nextEdit = player.get("nowPlayingPendingEdit");
    }

    return editedMessage;
  })();

  player.set("nowPlayingEditPromise", editPromise);
  try {
    return await editPromise;
  } finally {
    player.set("nowPlayingEditInFlight", false);
    player.set("nowPlayingEditPromise", null);
    player.set("nowPlayingPendingEdit", null);
  }
}

module.exports = {
  PROGRESS_SEGMENTS,
  buildNowPlayingEmbed,
  markNowPlayingUserAction,
  isNowPlayingUserActionPending,
  queueNowPlayingMessageEdit
};
