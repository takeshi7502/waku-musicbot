const YOUTUBE_ID = /^[a-zA-Z0-9_-]{11}$/;

function getYoutubeId(track) {
  const info = track?.info;
  if (!info) return null;
  if (
    info.sourceName?.toLowerCase() === "youtube" &&
    YOUTUBE_ID.test(info.identifier)
  ) {
    return info.identifier;
  }
  // An identifier from Spotify/SoundCloud/etc. must never become a video ID.
  try {
    const url = new URL(info.uri);
    const host = url.hostname.toLowerCase();
    const id =
      host === "youtu.be"
        ? url.pathname.slice(1)
        : [
            "youtube.com",
            "www.youtube.com",
            "m.youtube.com",
            "music.youtube.com",
          ].includes(host)
        ? url.searchParams.get("v")
        : null;
    return id && YOUTUBE_ID.test(id) ? id : null;
  } catch {
    return null;
  }
}

const normalize = (value) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");

function createAutoPlayFunction({ playedTracks, warn }) {
  const pending = new WeakSet();
  return async function autoPlayFunction(player, lastTrack) {
    const available = () =>
      player.get("autoQueue") &&
      !player.destroyed &&
      !player.queue.current &&
      !player.queue.tracks.length &&
      !player.playing &&
      !player.paused;
    if (!lastTrack?.info || pending.has(player) || !available()) return;
    pending.add(player);
    try {
      const requester = player.get("requester");
      const query = [lastTrack.info.title, lastTrack.info.author]
        .filter((value) => typeof value === "string" && value.trim())
        .join(" ");
      let searchTracks = null;
      const search = async (query) => {
        try {
          const result = await player.search(
            { query, source: "youtube" },
            requester
          );
          return Array.isArray(result?.tracks) ? result.tracks : [];
        } catch (error) {
          warn(`AutoQueue error: ${error.message}`);
          return [];
        }
      };
      const searchByMetadata = async () => {
        if (searchTracks === null) {
          searchTracks = query ? await search(`ytsearch:${query}`) : [];
        }
        return searchTracks;
      };

      let seedId = getYoutubeId(lastTrack);
      if (!seedId) {
        // LavaSrc exposes the Spotify ID even when audio is mirrored to YouTube.
        // Resolve metadata first; only a real YouTube result can seed a mix.
        const matches = await searchByMetadata();
        seedId = matches.map(getYoutubeId).find(Boolean);
      }
      if (!available()) return;
      let candidates = seedId
        ? await search(
            `https://www.youtube.com/watch?v=${seedId}&list=RD${seedId}`
          )
        : [];
      if (!available()) return;

      const filterCandidates = (tracks) => {
        const seen = new Set();
        return tracks.filter((track) => {
          const info = track?.info;
          if (!info?.identifier || track === lastTrack) return false;
          const id = getYoutubeId(track);
          if (!id) return false;
          const key = `${info.sourceName || ""}:${info.identifier}`;
          const sameSong =
            normalize(info.title) &&
            normalize(lastTrack.info.title) === normalize(info.title) &&
            normalize(lastTrack.info.author) &&
            normalize(lastTrack.info.author) === normalize(info.author);
          if (
            id === seedId ||
            sameSong ||
            seen.has(key) ||
            (info.sourceName === lastTrack.info.sourceName &&
              info.identifier === lastTrack.info.identifier) ||
            playedTracks.includes(info.identifier)
          )
            return false;
          seen.add(key);
          return true;
        });
      };
      candidates = filterCandidates(candidates);
      if (!candidates.length) {
        candidates = filterCandidates(await searchByMetadata());
      }
      // Searches may finish after AutoQueue is disabled or a manual /play.
      if (!available() || !candidates.length) return;
      await player.queue.add(candidates.slice(0, 5));
      // lavalink-client's queueEnd advances the queue and starts playback itself.
      // Calling player.play() here would race its autoSkip handling.
    } catch (error) {
      warn(`AutoQueue error: ${error.message}`);
    } finally {
      pending.delete(player);
    }
  };
}

module.exports = { createAutoPlayFunction, getYoutubeId };
