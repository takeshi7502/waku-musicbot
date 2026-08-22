"use strict";

const elements = {
  headerStatus: document.querySelector("#header-status"),
  lastUpdate: document.querySelector("#last-update"),
  noticeList: document.querySelector("#notice-list"),
  nodeCard: document.querySelector("#node-card"),
  nodeName: document.querySelector("#node-name"),
  nodeState: document.querySelector("#node-state"),
  nodeStateBadge: document.querySelector("#node-state-badge"),
  nodeVersion: document.querySelector("#node-version"),
  players: document.querySelector("#metric-players"),
  playing: document.querySelector("#metric-playing"),
  uptime: document.querySelector("#metric-uptime"),
  cpu: document.querySelector("#metric-cpu"),
  systemLoad: document.querySelector("#metric-system-load"),
  memory: document.querySelector("#metric-memory"),
  availability: document.querySelector("#metric-availability"),
  cores: document.querySelector("#metric-cores"),
  network: document.querySelector("#metric-network"),
  sourceCount: document.querySelector("#source-count"),
  sourceList: document.querySelector("#source-list"),
  activityCount: document.querySelector("#activity-count"),
  activitySubtitle: document.querySelector("#activity-subtitle"),
  activityList: document.querySelector("#activity-list")
};

let lastNewsSignature = null;
let lastSourcesSignature = null;
let lastActivitySignature = null;

function formatDuration(milliseconds) {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (days) return `${days}d ${hours}h`;
  if (hours) return `${hours}h ${minutes}m`;
  if (minutes) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

function formatTrackDuration(milliseconds, stream) {
  if (stream) return "LIVE";
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return hours ? `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}` : `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function formatBytes(bytes) {
  if (!bytes) return "0 MB";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** exponent).toFixed(exponent >= 2 ? 1 : 0)} ${units[exponent]}`;
}

function sourceName(source) {
  const names = {
    youtube: "YouTube",
    soundcloud: "SoundCloud",
    spotify: "Spotify",
    applemusic: "Apple Music",
    deezer: "Deezer",
    yandexmusic: "Yandex Music",
    bandcamp: "Bandcamp",
    vimeo: "Vimeo",
    twitch: "Twitch",
    http: "HTTP Streaming",
    local: "Local files"
  };
  return names[String(source || "").toLowerCase()] || source || "Unknown";
}

function sourceMark(source) {
  return {
    youtube: "YT",
    soundcloud: "SC",
    spotify: "SP",
    applemusic: "AM",
    deezer: "DZ",
    yandexmusic: "YM",
    bandcamp: "BC",
    vimeo: "VM",
    twitch: "TW",
    http: "HT"
  }[String(source || "").toLowerCase()] || "♪";
}

function sourceIconUrl(source) {
  const icons = {
    youtube: "https://cdn.simpleicons.org/youtube/FF0000",
    soundcloud: "https://cdn.simpleicons.org/soundcloud/FF5500",
    spotify: "https://cdn.simpleicons.org/spotify/1ED760",
    applemusic: "https://cdn.simpleicons.org/applemusic/FA243C",
    deezer: "https://cdn.simpleicons.org/deezer/A238FF",
    yandexmusic: "https://cdn.simpleicons.org/yandexmusic/FF0000",
    bandcamp: "https://cdn.simpleicons.org/bandcamp/629AA9",
    twitch: "https://cdn.simpleicons.org/twitch/9146FF",
    vimeo: "https://cdn.simpleicons.org/vimeo/1AB7EA"
  };
  return icons[String(source || "").toLowerCase()] || null;
}

function stateLabel(state) {
  return {
    playing: "Đang phát",
    finished: "Đã phát",
    stopped: "Đã dừng",
    replaced: "Đã thay",
    failed: "Lỗi phát",
    stuck: "Bị kẹt"
  }[state] || "Đã phát";
}

function renderNews(news) {
  const signature = JSON.stringify(news);
  if (signature === lastNewsSignature) return;
  lastNewsSignature = signature;

  elements.noticeList.replaceChildren();
  const entries = news.length ? news : [{ level: "info", text: "Không có thông báo mới." }];
  for (const entry of entries) {
    const item = document.createElement("li");
    item.className = `notice notice-${entry.level}`;
    const text = document.createElement("span");
    text.className = "notice-text";
    text.textContent = entry.text;
    item.append(text);

    if (entry.buttonUrl && entry.buttonLabel) {
      const button = document.createElement("a");
      button.className = "notice-button";
      button.href = entry.buttonUrl;
      button.target = "_blank";
      button.rel = "noopener noreferrer";
      button.textContent = entry.buttonLabel;
      item.append(button);
    }

    elements.noticeList.append(item);
  }
}

function renderNode(node) {
  const online = Boolean(node.online);
  elements.headerStatus.className = `header-status ${online ? "online" : "offline"}`;
  elements.headerStatus.lastElementChild.textContent = online ? "Node đang trực tuyến" : "Lavalink đang ngoại tuyến";
  elements.nodeCard.classList.toggle("offline", !online);
  elements.nodeName.textContent = node.name || "Lavalink";
  elements.nodeState.textContent = online ? "Kết nối trực tiếp với Lavalink REST API" : "Không lấy được phản hồi từ Lavalink";
  elements.nodeStateBadge.className = `state-badge ${online ? "" : "offline"}`;
  elements.nodeStateBadge.textContent = online ? "ONLINE" : "OFFLINE";
  elements.nodeVersion.textContent = node.version ? `Lavalink v${node.version}` : "Lavalink —";
  elements.players.textContent = node.players ?? "—";
  elements.playing.textContent = node.playingPlayers ?? "—";
  elements.uptime.textContent = online ? formatDuration(node.uptimeMs) : "—";
  elements.cpu.textContent = online ? `${((node.cpu?.lavalinkLoad || 0) * 100).toFixed(1)}%` : "—";
  elements.systemLoad.textContent = online ? `${((node.cpu?.systemLoad || 0) * 100).toFixed(1)}%` : "—";
  elements.memory.textContent = online ? `${formatBytes(node.memory?.used || 0)} / ${formatBytes(node.memory?.allocated || 0)}` : "—";
  elements.availability.textContent = node.uptime24h?.available ? `${node.uptime24h.percentage.toFixed(2)}%` : "Đang thu thập";
  elements.cores.textContent = online ? `${node.cpu?.cores || 0} cores` : "—";
  elements.network.textContent = typeof node.networkBytes === "number" ? formatBytes(node.networkBytes) : "Không rõ";
}

function renderSources(node) {
  const sources = Array.isArray(node.sources) ? node.sources : [];
  const signature = JSON.stringify({ online: Boolean(node.online), sources });
  if (signature === lastSourcesSignature) return;
  lastSourcesSignature = signature;

  elements.sourceList.replaceChildren();
  elements.sourceCount.textContent = sources.length ? `${sources.length} nguồn` : "Chưa có dữ liệu";

  if (!sources.length) {
    const empty = document.createElement("li");
    empty.className = "source-empty";
    empty.textContent = node.online ? "Lavalink chưa trả về danh sách nguồn phát." : "Danh sách nguồn sẽ hiện khi node trực tuyến.";
    elements.sourceList.append(empty);
    return;
  }

  for (const source of sources) {
    const item = document.createElement("li");
    item.className = "source-item";
    item.dataset.source = source;

    const mark = document.createElement("span");
    mark.className = "source-mark";
    const iconUrl = sourceIconUrl(source);
    if (iconUrl) {
      const icon = document.createElement("img");
      icon.className = "source-icon";
      icon.src = iconUrl;
      icon.alt = "";
      icon.loading = "lazy";
      icon.addEventListener("error", () => {
        mark.textContent = sourceMark(source);
      }, { once: true });
      mark.append(icon);
    } else {
      mark.textContent = sourceMark(source);
    }

    const label = document.createElement("span");
    label.className = "source-label";
    label.textContent = sourceName(source);

    const ready = document.createElement("span");
    ready.className = "source-ready";
    ready.textContent = "READY";

    item.append(mark, label, ready);
    elements.sourceList.append(item);
  }
}

function makeArtwork(item) {
  if (!item.artworkUrl) {
    const fallback = document.createElement("div");
    fallback.className = "track-art-fallback";
    fallback.textContent = "♫";
    return fallback;
  }

  const artwork = document.createElement("img");
  artwork.className = "track-art";
  artwork.src = item.artworkUrl;
  artwork.alt = "";
  artwork.loading = "lazy";
  artwork.referrerPolicy = "no-referrer";
  artwork.addEventListener("error", () => artwork.replaceWith(makeArtwork({})), { once: true });
  return artwork;
}

function renderActivity(activity) {
  const items = Array.isArray(activity.items) ? activity.items : [];
  const signature = JSON.stringify({ available: Boolean(activity.available), items });
  if (signature === lastActivitySignature) return;
  lastActivitySignature = signature;

  elements.activityCount.textContent = `${items.length} mục`;
  elements.activityList.replaceChildren();

  if (!activity.available) {
    elements.activitySubtitle.textContent = "Status plugin chưa sẵn sàng. Node vẫn có thể hoạt động bình thường.";
    elements.activityList.append(makeEmptyState("Chưa đọc được activity plugin. Hãy kiểm tra JAR plugin và restart Lavalink."));
    return;
  }

  if (!items.length) {
    elements.activitySubtitle.textContent = "Bài hát sẽ xuất hiện ở đây ngay khi Lavalink bắt đầu phát.";
    elements.activityList.append(makeEmptyState("Chưa có hoạt động phát nhạc trong phiên Lavalink hiện tại."));
    return;
  }

  elements.activitySubtitle.textContent = "Feed này chỉ hiển thị metadata bài hát đã được plugin lọc an toàn.";
  for (const item of items) {
    const row = document.createElement("article");
    row.className = `track ${item.status}`;
    row.append(makeArtwork(item));

    const detail = document.createElement("div");
    detail.className = "track-detail";
    const title = document.createElement(item.uri ? "a" : "p");
    title.className = "track-title";
    title.textContent = item.title;
    title.title = item.title;
    if (item.uri) {
      title.href = item.uri;
      title.target = "_blank";
      title.rel = "noopener noreferrer";
    }
    const author = document.createElement("p");
    author.className = "track-author";
    author.textContent = item.author;
    const meta = document.createElement("p");
    meta.className = "track-meta";
    meta.textContent = `${formatTrackDuration(item.durationMs, item.stream)} · ${sourceName(item.source)}`;
    detail.append(title, author, meta);

    const state = document.createElement("span");
    state.className = "track-state";
    state.textContent = stateLabel(item.status);
    row.append(detail, state);
    elements.activityList.append(row);
  }
}

function makeEmptyState(message) {
  const empty = document.createElement("div");
  empty.className = "empty-state";
  empty.textContent = message;
  return empty;
}

function render(payload) {
  renderNews(payload.news || []);
  renderNode(payload.node || {});
  renderSources(payload.node || {});
  renderActivity(payload.activity || { available: false, items: [] });
  elements.lastUpdate.textContent = new Intl.DateTimeFormat("vi-VN", { hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(new Date(payload.generatedAt || Date.now()));
}

function startStatusStream() {
  const stream = new EventSource("/api/status/stream");
  stream.addEventListener("status", (event) => {
    try {
      render(JSON.parse(event.data));
    } catch {
      // Ignore one malformed event; EventSource keeps the last valid state.
    }
  });
  window.addEventListener("beforeunload", () => stream.close(), { once: true });
}

startStatusStream();
