package dev.takeshi.lavalink.status;

import com.sedmelluq.discord.lavaplayer.player.AudioPlayer;
import com.sedmelluq.discord.lavaplayer.player.event.AudioEventAdapter;
import com.sedmelluq.discord.lavaplayer.tools.FriendlyException;
import com.sedmelluq.discord.lavaplayer.track.AudioTrack;
import com.sedmelluq.discord.lavaplayer.track.AudioTrackEndReason;
import com.sedmelluq.discord.lavaplayer.track.AudioTrackInfo;
import dev.arbjerg.lavalink.api.IPlayer;
import dev.arbjerg.lavalink.api.ISocketContext;
import dev.arbjerg.lavalink.api.PluginEventHandler;
import java.net.URI;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentLinkedDeque;
import java.util.concurrent.ConcurrentMap;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

/**
 * Keeps a small, in-memory, sanitised activity feed for the status dashboard.
 *
 * <p>It deliberately never exposes Discord guild IDs, voice details, encoded tracks,
 * session IDs or requester data. A restart clears the feed by design.
 */
@Service
public final class ActivityTracker extends PluginEventHandler {
    static final int MAX_ENTRIES = 50;

    private static final Logger LOG = LoggerFactory.getLogger(ActivityTracker.class);

    private final ConcurrentLinkedDeque<ActivityItem> activity = new ConcurrentLinkedDeque<>();
    private final ConcurrentMap<Long, ActivityItem> activeTracks = new ConcurrentHashMap<>();

    public ActivityTracker() {
        LOG.info("Takeshi Lavalink status activity plugin loaded");
    }

    @Override
    public void onNewPlayer(ISocketContext context, IPlayer player) {
        long guildId = player.getGuildId();
        player.getAudioPlayer().addListener(new DashboardAudioListener(guildId));
        LOG.info("Attached status activity listener to a new Lavalink player");
    }

    @Override
    public void onDestroyPlayer(ISocketContext context, IPlayer player) {
        ActivityItem active = activeTracks.remove(player.getGuildId());
        if (active != null && "playing".equals(active.getStatus())) {
            active.finish("stopped");
        }
    }

    public ActivitySnapshot snapshot() {
        return new ActivitySnapshot(
                "takeshi-status-plugin",
                MAX_ENTRIES,
                new ArrayList<>(activity));
    }

    private void trackStarted(long guildId, AudioTrack track) {
        ActivityItem previous = activeTracks.remove(guildId);
        if (previous != null && "playing".equals(previous.getStatus())) {
            previous.finish("replaced");
        }

        ActivityItem item = ActivityItem.from(track);
        activeTracks.put(guildId, item);
        activity.addFirst(item);
        trimToLimit();
    }

    private void trackEnded(long guildId, AudioTrack track, AudioTrackEndReason reason) {
        finishActive(guildId, track, reason.name().toLowerCase());
    }

    private void trackFailed(long guildId, AudioTrack track) {
        finishActive(guildId, track, "failed");
    }

    private void trackStuck(long guildId, AudioTrack track) {
        finishActive(guildId, track, "stuck");
    }

    private void finishActive(long guildId, AudioTrack track, String status) {
        ActivityItem item = activeTracks.remove(guildId);
        if (item != null) {
            item.finish(status);
            return;
        }

        // A plugin reload can make an end event arrive without a tracked start event.
        ActivityItem recovered = ActivityItem.from(track);
        recovered.finish(status);
        activity.addFirst(recovered);
        trimToLimit();
    }

    private void trimToLimit() {
        while (activity.size() > MAX_ENTRIES) {
            activity.pollLast();
        }
    }

    private final class DashboardAudioListener extends AudioEventAdapter {
        private final long guildId;

        private DashboardAudioListener(long guildId) {
            this.guildId = guildId;
        }

        @Override
        public void onTrackStart(AudioPlayer player, AudioTrack track) {
            trackStarted(guildId, track);
        }

        @Override
        public void onTrackEnd(AudioPlayer player, AudioTrack track, AudioTrackEndReason endReason) {
            trackEnded(guildId, track, endReason);
        }

        @Override
        public void onTrackException(AudioPlayer player, AudioTrack track, FriendlyException exception) {
            trackFailed(guildId, track);
        }

        @Override
        public void onTrackStuck(AudioPlayer player, AudioTrack track, long thresholdMs) {
            trackStuck(guildId, track);
        }
    }

    public record ActivitySnapshot(String plugin, int limit, List<ActivityItem> items) {}

    public static final class ActivityItem {
        private final String id;
        private final String title;
        private final String author;
        private final long durationMs;
        private final boolean stream;
        private final String source;
        private final String uri;
        private final String artworkUrl;
        private final long startedAt;
        private volatile long updatedAt;
        private volatile String status;

        private ActivityItem(
                String id,
                String title,
                String author,
                long durationMs,
                boolean stream,
                String source,
                String uri,
                String artworkUrl,
                long startedAt,
                long updatedAt,
                String status) {
            this.id = id;
            this.title = title;
            this.author = author;
            this.durationMs = durationMs;
            this.stream = stream;
            this.source = source;
            this.uri = uri;
            this.artworkUrl = artworkUrl;
            this.startedAt = startedAt;
            this.updatedAt = updatedAt;
            this.status = status;
        }

        static ActivityItem from(AudioTrack track) {
            AudioTrackInfo info = track.getInfo();
            long now = System.currentTimeMillis();
            return new ActivityItem(
                    UUID.randomUUID().toString(),
                    safeText(info.title, "Unknown track"),
                    safeText(info.author, "Unknown artist"),
                    Math.max(0, info.length),
                    info.isStream,
                    safeText(track.getSourceManager().getSourceName(), "unknown"),
                    safeUri(info.uri),
                    safeArtwork(info.artworkUrl),
                    now,
                    now,
                    "playing");
        }

        void finish(String nextStatus) {
            status = nextStatus;
            updatedAt = System.currentTimeMillis();
        }

        public String getId() { return id; }
        public String getTitle() { return title; }
        public String getAuthor() { return author; }
        public long getDurationMs() { return durationMs; }
        public boolean isStream() { return stream; }
        public String getSource() { return source; }
        public String getUri() { return uri; }
        public String getArtworkUrl() { return artworkUrl; }
        public long getStartedAt() { return startedAt; }
        public long getUpdatedAt() { return updatedAt; }
        public String getStatus() { return status; }

        private static String safeText(String value, String fallback) {
            if (value == null || value.isBlank()) {
                return fallback;
            }
            return value.length() > 500 ? value.substring(0, 500) : value;
        }

        private static String safeArtwork(String value) {
            return safeHttpUrl(value);
        }

        private static String safeUri(String value) {
            return safeHttpUrl(value);
        }

        private static String safeHttpUrl(String value) {
            if (value == null || value.isBlank()) {
                return null;
            }

            try {
                URI uri = URI.create(value);
                String scheme = uri.getScheme();
                return ("https".equalsIgnoreCase(scheme) || "http".equalsIgnoreCase(scheme))
                                && value.length() <= 2048
                        ? value
                        : null;
            } catch (IllegalArgumentException ignored) {
                return null;
            }
        }
    }
}
