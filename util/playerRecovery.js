const { EmbedBuilder } = require("discord.js");

function makeFallbackQuery(track) {
  return [track?.info?.title, track?.info?.author].filter(Boolean).join(" - ");
}

function serializeRequester(requester) {
  if (!requester || typeof requester !== "object") return null;

  return {
    id: requester.id || null,
    username: requester.username || requester.tag || null,
  };
}

/**
 * Save only the minimum data necessary to find and replay the current song.
 * Queued tracks and playback position are intentionally not restored: this
 * matches the existing Lavalink reload behaviour and avoids stale queues.
 */
function createPlayerRecoverySnapshots(client, players) {
  return players.flatMap((player) => {
    const track = player.queue?.current;
    if (!player.playing || player.paused || !track) return [];

    const fallbackQuery = makeFallbackQuery(track);
    const uri = track.info?.uri;
    const query = typeof uri === "string" && uri.trim() ? uri : fallbackQuery;
    if (
      !query ||
      !player.guildId ||
      !player.voiceChannelId ||
      !player.textChannelId
    ) {
      return [];
    }

    return [
      {
        guildId: player.guildId,
        voiceChannelId: player.voiceChannelId,
        textChannelId: player.textChannelId,
        query,
        fallbackQuery: fallbackQuery || null,
        requester: serializeRequester(
          track.requester || player.get("requester") || client.user
        ),
      },
    ];
  });
}

function resolveRequester(client, snapshot) {
  if (snapshot.requester?.id) {
    return client.users.cache.get(snapshot.requester.id) || client.user;
  }
  return client.user;
}

async function waitForAvailableLavalink(client, timeoutMs = 90_000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const node = await client.getLavalink(client);
    if (node) return node;
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
  return undefined;
}

async function restoreRecoveredPlayer(client, snapshot, node = null) {
  const targetNode = node || (await client.getLavalink(client));
  if (!targetNode) throw new Error("No Lavalink node is connected.");

  const player = client.manager.createPlayer({
    guildId: snapshot.guildId,
    voiceChannelId: snapshot.voiceChannelId,
    textChannelId: snapshot.textChannelId,
    selfDeaf: client.config.serverDeafen,
    selfMute: false,
    node: targetNode.id,
  });
  if (!player.connected) await player.connect();

  let result = null;
  const queries = [
    ...new Set([snapshot.query, snapshot.fallbackQuery].filter(Boolean)),
  ];
  for (const query of queries) {
    try {
      const searchResult = await player.search(
        { query },
        resolveRequester(client, snapshot)
      );
      if (
        searchResult &&
        ["track", "search", "playlist"].includes(searchResult.loadType) &&
        searchResult.tracks?.length
      ) {
        result = searchResult;
        break;
      }
    } catch {}
  }

  if (!result) {
    await player.destroy().catch(() => {});
    throw new Error("Could not resolve the saved track.");
  }

  await player.queue.add(result.tracks[0]);
  await player.play({ paused: false });
  return player;
}

async function sendRecoveryNotice(client, snapshot, messageKey) {
  let textChannel = client.channels.cache.get(snapshot.textChannelId);
  if (!textChannel) {
    textChannel = await client.channels
      .fetch(snapshot.textChannelId)
      .catch(() => null);
  }
  if (!textChannel?.isTextBased?.()) return;

  await textChannel
    .send({
      embeds: [
        new EmbedBuilder()
          .setColor("#FF8800")
          .setDescription(client.translateGuild(snapshot.guildId, messageKey))
          .setTimestamp(),
      ],
    })
    .catch(() => {});
}

module.exports = {
  createPlayerRecoverySnapshots,
  restoreRecoveredPlayer,
  sendRecoveryNotice,
  waitForAvailableLavalink,
};
