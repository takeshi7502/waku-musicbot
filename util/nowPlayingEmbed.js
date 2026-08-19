const { escapeMarkdown } = require("discord.js");
const { translate } = require("./i18n");

const PROGRESS_SEGMENTS = 12;
const CODE_TICK = String.fromCharCode(96);
const SOURCE_ICON_URLS = {
  youtube: "https://cdn.jsdelivr.net/gh/homarr-labs/dashboard-icons/png/youtube.png",
  soundcloud: "https://cdn.jsdelivr.net/gh/homarr-labs/dashboard-icons/png/soundcloud.png",
  spotify: "https://cdn.jsdelivr.net/gh/homarr-labs/dashboard-icons/png/spotify.png"
};
const SOURCE_NAMES = {
  youtube: "YouTube",
  soundcloud: "SoundCloud",
  spotify: "Spotify"
};

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

function translateForPlayer(client, player, key, vars = {}) {
  return translate(client.guildLanguages?.get(player.guildId) || "vi", key, vars);
}

function getTrackSource(track) {
  const sourceName = String(track.info.sourceName || "").toLowerCase();
  if (sourceName.includes("youtube") || sourceName === "yt") return "youtube";
  if (sourceName.includes("soundcloud")) return "soundcloud";
  if (sourceName.includes("spotify")) return "spotify";

  try {
    const hostname = new URL(track.info.uri).hostname.toLowerCase();
    if (hostname === "youtu.be" || hostname.endsWith("youtube.com")) return "youtube";
    if (hostname.endsWith("soundcloud.com")) return "soundcloud";
    if (hostname.endsWith("spotify.com")) return "spotify";
  } catch {}

  return null;
}

function buildNowPlayingEmbed(client, player, track) {
  const title = escapeMarkdown(track.info.title || translateForPlayer(client, player, "player.noDescription"))
    .replace(/\]/g, "")
    .replace(/\[/g, "");
  const requester = track.requester?.id || track.requester || client.user.id;
  const isStream = track.info.isStream;
  const totalDuration = isStream ? "LIVE" : formatTime(track.info.duration);
  const playbackIcon = player.paused ? "⏸️" : "▶️";
  const loopMode = player.repeatMode === "track"
    ? translateForPlayer(client, player, "player.loopTrack")
    : player.repeatMode === "queue"
      ? translateForPlayer(client, player, "player.loopQueue")
      : "Off";
  const playbackDetails = translateForPlayer(client, player, "player.playbackDetails", {
    loop: loopMode,
    autoQueue: player.get("autoQueue") ? "ON" : "Off",
    volume: player.volume
  });
  const progress = isStream
    ? playbackIcon + " 🔴 LIVE"
    : playbackIcon + " " + CODE_TICK + "0:00 " + buildProgressBar(player.position, track.info.duration) + " " + totalDuration + CODE_TICK;
  const description = track.info.uri
    ? "[**" + title + "**](" + track.info.uri + ")\n" + progress
    : "**" + title + "**\n" + progress;

  const source = getTrackSource(track);
  const author = {
    name: source
      ? translateForPlayer(client, player, "player.nowPlayingOn", { platform: SOURCE_NAMES[source] })
      : translateForPlayer(client, player, "player.nowPlaying")
  };
  if (source) author.iconURL = SOURCE_ICON_URLS[source];

  const embed = client.Embed()
    .setAuthor(author)
    .setDescription(description)
    .addFields({
      name: translateForPlayer(client, player, "player.requestedBy"),
      value: "<@" + requester + ">",
      inline: true
    }, {
      name: translateForPlayer(client, player, "player.duration"),
      value: CODE_TICK + totalDuration + CODE_TICK,
      inline: true
    }, {
      name: " ",
      value: "-# " + playbackDetails,
      inline: false
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

async function refreshNowPlayingPanel(client, player) {
  const message = player.get("nowPlayingMessage");
  const track = player.queue.current;
  if (!message || !track) return null;

  return queueNowPlayingMessageEdit(player, message, {
    embeds: [buildNowPlayingEmbed(client, player, track)],
    components: client.createController(player.guildId, player)
  });
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
  refreshNowPlayingPanel,
  queueNowPlayingMessageEdit
};
