"use strict";

const elements = {
  headerStatus: document.querySelector("#header-status"),
  lastUpdate: document.querySelector("#last-update"),
  noticeList: document.querySelector("#notice-list"),
  nodeList: document.querySelector("#node-list"),
  sourceCount: document.querySelector("#source-count"),
  sourceList: document.querySelector("#source-list"),
  activityCount: document.querySelector("#activity-count"),
  activitySubtitle: document.querySelector("#activity-subtitle"),
  activityList: document.querySelector("#activity-list")
};

let lastNewsSignature = null;
let lastSourcesSignature = null;
let lastActivitySignature = null;
let activityInitialised = false;
let currentTimeZone = "Asia/Ho_Chi_Minh";

function formatDuration(milliseconds) {
  const totalSeconds = Math.max(0, Math.floor(Number(milliseconds || 0) / 1000));
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
  const totalSeconds = Math.max(0, Math.floor(Number(milliseconds || 0) / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return hours
    ? `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`
    : `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function formatBytes(bytes) {
  if (!bytes) return "0 MB";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** exponent).toFixed(exponent >= 2 ? 1 : 0)} ${units[exponent]}`;
}

function formatPlayedAt(timestamp) {
  if (!Number.isFinite(Number(timestamp))) return "Giờ phát không rõ";
  try {
    const text = new Intl.DateTimeFormat("vi-VN", {
      timeZone: currentTimeZone,
      hour: "2-digit",
      minute: "2-digit",
      day: "2-digit",
      month: "2-digit"
    }).format(new Date(Number(timestamp)));
    return `Phát lúc ${text}`;
  } catch {
    return `Phát lúc ${new Date(Number(timestamp)).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })}`;
  }
}

function formatLastUpdate(timestamp) {
  try {
    return new Intl.DateTimeFormat("vi-VN", {
      timeZone: currentTimeZone,
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit"
    }).format(new Date(timestamp || Date.now()));
  } catch {
    return new Date(timestamp || Date.now()).toLocaleTimeString("vi-VN");
  }
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
  }[String(source || "").toLowerCase()] || "♫";
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

function metricMarkup() {
  const labels = [
    ["players", "Players"],
    ["playing", "Đang phát"],
    ["uptime", "Uptime"],
    ["cpu", "CPU node"],
    ["system-load", "Load hệ thống"],
    ["memory", "Bộ nhớ"],
    ["availability", "Khả dụng 24h"],
    ["cores", "CPU cores"],
    ["network", "Mạng (từ boot)"]
  ];
  const fragment = document.createDocumentFragment();
  for (const [key, label] of labels) {
    const metric = document.createElement("div");
    metric.className = "metric";
    metric.innerHTML = `<span>${label}</span><strong data-metric="${key}">—</strong>`;
    fragment.append(metric);
  }
  return fragment;
}

function createNodeCard(node) {
  const card = document.createElement("article");
  card.className = "node-card";
  card.dataset.nodeId = node.id;

  const summary = document.createElement("button");
  summary.type = "button";
  summary.className = "node-summary";
  summary.setAttribute("aria-expanded", "false");
  summary.setAttribute("aria-controls", `node-metrics-${node.id}`);

  const nameWrap = document.createElement("span");
  nameWrap.className = "node-name-wrap";
  const orb = document.createElement("span");
  orb.className = "node-orb";
  orb.setAttribute("aria-hidden", "true");
  const copy = document.createElement("span");
  copy.className = "node-copy";
  const name = document.createElement("strong");
  name.className = "node-name";
  const state = document.createElement("span");
  state.className = "node-state";
  copy.append(name, state);
  nameWrap.append(orb, copy);

  const summaryRight = document.createElement("span");
  summaryRight.className = "node-summary-right";
  const version = document.createElement("span");
  version.className = "version-pill";
  const badge = document.createElement("span");
  badge.className = "state-badge checking";
  const caret = document.createElement("span");
  caret.className = "node-caret";
  caret.setAttribute("aria-hidden", "true");
  caret.textContent = "⌄";
  summaryRight.append(version, badge, caret);
  summary.append(nameWrap, summaryRight);

  const metricsWrap = document.createElement("div");
  metricsWrap.className = "node-metrics-wrap";
  metricsWrap.id = `node-metrics-${node.id}`;
  metricsWrap.hidden = true;
  const metrics = document.createElement("div");
  metrics.className = "metric-grid";
  metrics.append(metricMarkup());
  metricsWrap.append(metrics);
  card.append(summary, metricsWrap);

  summary.addEventListener("click", () => {
    const expanded = !card.classList.contains("is-open");
    card.classList.toggle("is-open", expanded);
    summary.setAttribute("aria-expanded", String(expanded));
    metricsWrap.hidden = !expanded;
  });
  return card;
}

function updateNodeCard(card, node) {
  const online = Boolean(node.online);
  card.classList.toggle("offline", !online);
  card.querySelector(".node-name").textContent = node.name || "Lavalink";
  card.querySelector(".node-state").textContent = online
    ? "Kết nối trực tiếp với Lavalink REST API"
    : "Không lấy được phản hồi từ Lavalink";

  const badge = card.querySelector(".state-badge");
  badge.className = `state-badge ${online ? "" : "offline"}`;
  badge.textContent = online ? "ONLINE" : "OFFLINE";
  card.querySelector(".version-pill").textContent = node.version ? `Lavalink v${node.version}` : "Lavalink —";

  const values = {
    players: node.players ?? "—",
    playing: node.playingPlayers ?? "—",
    uptime: online ? formatDuration(node.uptimeMs) : "—",
    cpu: online ? `${((node.cpu?.lavalinkLoad || 0) * 100).toFixed(1)}%` : "—",
    "system-load": online ? `${((node.cpu?.systemLoad || 0) * 100).toFixed(1)}%` : "—",
    memory: online ? `${formatBytes(node.memory?.used || 0)} / ${formatBytes(node.memory?.allocated || 0)}` : "—",
    availability: node.uptime24h?.available ? `${node.uptime24h.percentage.toFixed(2)}%` : "Đang thu thập",
    cores: online ? `${node.cpu?.cores || 0} cores` : "—",
    network: typeof node.networkBytes === "number" ? formatBytes(node.networkBytes) : "Không rõ"
  };
  for (const [key, value] of Object.entries(values)) {
    card.querySelector(`[data-metric="${key}"]`).textContent = value;
  }
}

function renderNodes(nodes) {
  const safeNodes = Array.isArray(nodes) ? nodes : [];
  const expectedIds = new Set(safeNodes.map((node) => node.id));
  for (const card of elements.nodeList.querySelectorAll(".node-card")) {
    if (!expectedIds.has(card.dataset.nodeId)) card.remove();
  }

  for (const node of safeNodes) {
    let card = elements.nodeList.querySelector(`.node-card[data-node-id="${CSS.escape(node.id)}"]`);
    if (!card) card = createNodeCard(node);
    updateNodeCard(card, node);
    elements.nodeList.append(card);
  }

  const onlineCount = safeNodes.filter((node) => node.online).length;
  const hasNodes = safeNodes.length > 0;
  elements.headerStatus.className = `header-status ${onlineCount ? "online" : "offline"}`;
  elements.headerStatus.lastElementChild.textContent = !hasNodes
    ? "Chưa có node nào"
    : onlineCount
      ? `${onlineCount}/${safeNodes.length} node đang trực tuyến`
      : "Tất cả node đang ngoại tuyến";
}

function renderSources(sources, nodes) {
  const safeSources = Array.isArray(sources) ? sources : [];
  const onlineNodes = Array.isArray(nodes) ? nodes.filter((node) => node.online).length : 0;
  const signature = JSON.stringify({ sources: safeSources, onlineNodes });
  if (signature === lastSourcesSignature) return;
  lastSourcesSignature = signature;

  elements.sourceList.replaceChildren();
  elements.sourceCount.textContent = safeSources.length ? `${safeSources.length} nguồn` : "Chưa có dữ liệu";

  if (!safeSources.length) {
    const empty = document.createElement("li");
    empty.className = "source-empty";
    empty.textContent = onlineNodes
      ? "Lavalink chưa trả về danh sách nguồn phát."
      : "Danh sách nguồn sẽ hiện khi có node trực tuyến.";
    elements.sourceList.append(empty);
    return;
  }

  for (const source of safeSources) {
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

function trackMeta(item) {
  return [
    formatPlayedAt(item.startedAt),
    formatTrackDuration(item.durationMs, item.stream),
    sourceName(item.source),
    item.nodeName
  ].filter(Boolean).join(" · ");
}

function createTrackRow(item, animate) {
  const row = document.createElement("article");
  row.className = `track ${item.status}`;
  row.dataset.trackId = item.id;
  if (animate) {
    row.classList.add("track-enter");
    row.addEventListener("animationend", () => row.classList.remove("track-enter"), { once: true });
  }
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
  meta.textContent = trackMeta(item);
  detail.append(title, author, meta);
  const state = document.createElement("span");
  state.className = "track-state";
  row.append(detail, state);
  updateTrackRow(row, item);
  return row;
}

function updateTrackRow(row, item) {
  for (const status of ["playing", "finished", "stopped", "replaced", "failed", "stuck"]) {
    row.classList.toggle(status, status === item.status);
  }
  row.querySelector(".track-state").textContent = stateLabel(item.status);
  row.querySelector(".track-meta").textContent = trackMeta(item);
}

function renderActivity(activity) {
  const items = Array.isArray(activity.items) ? activity.items : [];
  const signature = JSON.stringify({ available: Boolean(activity.available), items });
  if (signature === lastActivitySignature) return;
  lastActivitySignature = signature;
  elements.activityCount.textContent = `${items.length} mục`;

  if (!activity.available) {
    activityInitialised = false;
    elements.activitySubtitle.textContent = "Chưa có node nào gửi activity. Node vẫn có thể hoạt động bình thường.";
    elements.activityList.replaceChildren(makeEmptyState("Chưa đọc được activity plugin. Hãy kiểm tra JAR plugin của từng node."));
    return;
  }

  if (!items.length) {
    activityInitialised = true;
    elements.activitySubtitle.textContent = "Bài hát sẽ xuất hiện ở đây ngay khi một node bắt đầu phát.";
    elements.activityList.replaceChildren(makeEmptyState("Chưa có hoạt động phát nhạc trong phiên Lavalink hiện tại."));
    return;
  }

  const availableNodes = Number(activity.availableNodes || 0);
  const totalNodes = Number(activity.totalNodes || 0);
  elements.activitySubtitle.textContent = availableNodes && availableNodes < totalNodes
    ? `Feed nhận từ ${availableNodes}/${totalNodes} node đã cài status plugin; chỉ hiển thị metadata an toàn.`
    : "Feed chỉ hiển thị metadata bài hát đã được plugin lọc an toàn.";
  elements.activityList.querySelector(".empty-state")?.remove();

  const expectedIds = new Set(items.map((item) => item.id));
  const existingRows = new Map([...elements.activityList.querySelectorAll(".track")].map((row) => [row.dataset.trackId, row]));
  for (const [id, row] of existingRows) {
    if (!expectedIds.has(id)) row.remove();
  }
  for (const item of [...items].reverse()) {
    let row = existingRows.get(item.id);
    if (!row) row = createTrackRow(item, activityInitialised);
    else updateTrackRow(row, item);
    elements.activityList.prepend(row);
  }
  activityInitialised = true;
}

function makeEmptyState(message) {
  const empty = document.createElement("div");
  empty.className = "empty-state";
  empty.textContent = message;
  return empty;
}

function render(payload) {
  currentTimeZone = payload.timeZone || currentTimeZone;
  renderNews(payload.news || []);
  renderNodes(payload.nodes || []);
  renderSources(payload.sources || [], payload.nodes || []);
  renderActivity(payload.activity || { available: false, items: [] });
  elements.lastUpdate.textContent = formatLastUpdate(payload.generatedAt);
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
