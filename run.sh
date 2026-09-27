#!/usr/bin/env bash
# Minimal Lavalink setup helper for Debian/Ubuntu VPSes.
# It intentionally installs only Java. Lavalink and the local plugins are
# downloaded from their trusted releases; no Docker, Node.js or cipher host is used.

set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
NC='\033[0m'

SERVICE_NAME="lavalink"
TUNNEL_SERVICE_NAME="lavalink-cloudflared"
REDSOCKS_SERVICE_USER="lavalink-proxy"
REDSOCKS_LOCAL_PORT=12346
MODE1_TEMPLATE_FILE="$SCRIPT_DIR/example.application.yml"
MODE2_TEMPLATE_FILE="$SCRIPT_DIR/example.ytdlp.application.yml"
TEMPLATE_FILE="$MODE1_TEMPLATE_FILE"
CONFIG_FILE="$SCRIPT_DIR/application.yml"
JAR_FILE="$SCRIPT_DIR/Lavalink.jar"
PLUGIN_DIR="$SCRIPT_DIR/plugins"
BIN_DIR="$SCRIPT_DIR/bin"
YTDLP_FILE="$BIN_DIR/yt-dlp"
# youtube-source must not stay in the active plugins directory in mode 2,
# otherwise Lavalink loads it even though that mode is intended to be yt-dlp
# only. Keep it here while mode 2 is active so switching back never needs a
# second download.
MODE_ASSET_DIR="$SCRIPT_DIR/.lavalink-mode-assets"
YOUTUBE_PLUGIN_CACHE_DIR="$MODE_ASSET_DIR/youtube-source"
CF_TUNNEL_DIR="$SCRIPT_DIR/.cloudflared"
CF_TUNNEL_CONFIG_FILE="$CF_TUNNEL_DIR/config.yml"
CF_TUNNEL_SETTINGS_FILE="$SCRIPT_DIR/.lavalink-cloudflare-tunnel"
CLOUDFLARED_FILE="$BIN_DIR/cloudflared"
INTERACTIVE_TTY="/dev/tty"
SETUP_STATE_FILE="$SCRIPT_DIR/.lavalink-setup-state"
PROXY_SETTINGS_FILE="$SCRIPT_DIR/.lavalink-socks5-proxy"
PROXY_CONFIG_MARKER_FILE="/etc/redsocks-lavalink.managed"
MANAGED_SERVICE_MARKER="# Managed by waku-musicbot Lavalink setup"
LAVALINK_RELEASE_API="https://api.github.com/repos/lavalink-devs/Lavalink/releases/latest"
YOUTUBE_PLUGIN_VERSION="1.18.3"
YOUTUBE_PLUGIN_ASSET="youtube-plugin-${YOUTUBE_PLUGIN_VERSION}.jar"
YOUTUBE_RELEASE_API="https://api.github.com/repos/takeshi7502/youtube-source/releases/tags/${YOUTUBE_PLUGIN_VERSION}"
YTDLP_RELEASE_URL="https://github.com/yt-dlp/yt-dlp/releases/latest/download"
SETUP_RAW_BASE="https://raw.githubusercontent.com/takeshi7502/waku-musicbot/lavalink"

SETUP_MODE="plugin"
SETUP_MANAGEMENT_ONLY=false
MODE_SWITCHED=false
YOUTUBE_PLUGIN_UPDATED=false
PROXY_URI=""
PROXY_HOST=""
PROXY_PORT=""
PROXY_USERNAME=""
PROXY_PASSWORD=""
PROXY_REDSOCKS_TYPE="socks5"
PROXY_LABEL="SOCKS5"
PROXY_AUTO_DETECT=false
CF_TUNNEL_ID=""
CF_TUNNEL_NAME=""
CF_TUNNEL_HOSTNAME=""
CF_TUNNEL_SERVICE_USER=""
CF_TUNNEL_CREDENTIALS_FILE=""

header() {
  echo -e "${CYAN}===================================================${NC}"
  echo -e "${GREEN}$1${NC}"
  echo -e "${CYAN}===================================================${NC}"
}

info() { echo -e "${CYAN}• $*${NC}"; }
ok() { echo -e "${GREEN}✓ $*${NC}"; }
warn() { echo -e "${YELLOW}! $*${NC}"; }
die() { echo -e "${RED}✗ $*${NC}" >&2; exit 1; }

require_interactive_tty() {
  [ -r "$INTERACTIVE_TTY" ] && [ -w "$INTERACTIVE_TTY" ] || \
    die "This setup needs an interactive terminal. Run it directly in a shell."
}

read_tty() {
  local prompt="$1" secret="${2:-false}"

  require_interactive_tty
  printf '%s' "$prompt" > "$INTERACTIVE_TTY"
  if [ "$secret" = true ]; then
    if ! IFS= read -r -s REPLY < "$INTERACTIVE_TTY"; then
      die "Could not read input from the terminal."
    fi
    printf '\n' > "$INTERACTIVE_TTY"
  elif ! IFS= read -r REPLY < "$INTERACTIVE_TTY"; then
    die "Could not read input from the terminal."
  fi
}

sudo_cmd() {
  if [ "$EUID" -eq 0 ]; then
    "$@"
  else
    sudo "$@"
  fi
}

java_major() {
  java -version 2>&1 | awk -F '"' '/version/ {
    split($2, version, ".")
    print version[1] == "1" ? version[2] : version[1]
    exit
  }'
}

list_installed_packages() {
  dpkg-query -W -f='${binary:Package} ${db:Status-Status}\n' 2>/dev/null \
    | awk '$2 == "installed" { print $1 }' \
    | LC_ALL=C sort -u
}

state_get() {
  local key="$1"
  [ -f "$SETUP_STATE_FILE" ] || return 0
  awk -F= -v key="$key" '$1 == key { value = substr($0, length(key) + 2) } END { if (value != "") print value }' "$SETUP_STATE_FILE"
}

state_set() {
  local key="$1" value="$2" temporary_state
  [[ "$key" =~ ^[A-Z][A-Z0-9_]*$ ]] || die "Invalid setup-state key."
  [[ "$value" != *$'\n'* ]] || die "Invalid setup-state value."
  temporary_state="${SETUP_STATE_FILE}.tmp.$$"

  (
    umask 077
    if [ -f "$SETUP_STATE_FILE" ]; then
      grep -v -F -- "${key}=" "$SETUP_STATE_FILE" || true
    fi
    printf '%s=%s\n' "$key" "$value"
  ) > "$temporary_state"
  mv "$temporary_state" "$SETUP_STATE_FILE"
  chmod 600 "$SETUP_STATE_FILE"
}

state_append_unique() {
  local key="$1" value="$2"
  [[ "$key" =~ ^[A-Z][A-Z0-9_]*$ ]] || die "Invalid setup-state key."
  [[ "$value" != *$'\n'* ]] || die "Invalid setup-state value."

  if [ -f "$SETUP_STATE_FILE" ] && grep -Fqx -- "${key}=${value}" "$SETUP_STATE_FILE"; then
    return
  fi

  (
    umask 077
    printf '%s=%s\n' "$key" "$value" >> "$SETUP_STATE_FILE"
  )
  chmod 600 "$SETUP_STATE_FILE"
}

record_java_installation() {
  local package_name="$1" created_packages_file="$2" package
  state_set "JAVA_PACKAGE" "$package_name"
  while IFS= read -r package; do
    [ -n "$package" ] && state_append_unique "JAVA_CREATED_PACKAGE" "$package"
  done < "$created_packages_file"
}

set_setup_mode() {
  case "$1" in
    plugin)
      SETUP_MODE="plugin"
      TEMPLATE_FILE="$MODE1_TEMPLATE_FILE"
      ;;
    ytdlp)
      SETUP_MODE="ytdlp"
      TEMPLATE_FILE="$MODE2_TEMPLATE_FILE"
      ;;
    *) die "Unknown Lavalink setup mode: $1" ;;
  esac
}

mode_label() {
  case "$SETUP_MODE" in
    plugin) printf '%s' 'youtube-source plugin' ;;
    ytdlp) printf '%s' "LavaSrc + yt-dlp" ;;
  esac
}

detect_existing_config_mode() {
  if grep -Eq '^[[:space:]]*ytdlp:[[:space:]]*true[[:space:]]*$' "$CONFIG_FILE"; then
    printf '%s\n' "ytdlp"
  else
    printf '%s\n' "plugin"
  fi
}

select_setup_mode() {
  local selected_mode existing_mode=""

  header "Choose Lavalink source mode"
  echo "1) [1] youtube-source plugin v$YOUTUBE_PLUGIN_VERSION"
  echo "2) [2] yt-dlp"
  echo "3) Manage Lavalink"
  read_tty "Choose [1]: "
  SETUP_MANAGEMENT_ONLY=false
  MODE_SWITCHED=false
  YOUTUBE_PLUGIN_UPDATED=false
  case "${REPLY:-1}" in
    1) selected_mode="plugin" ;;
    2) selected_mode="ytdlp" ;;
    3)
      if [ ! -f "$CONFIG_FILE" ]; then
        warn "No existing application.yml was found. Choose mode 1 or 2 to set up Lavalink first."
        return 1
      fi
      selected_mode="$(detect_existing_config_mode)"
      SETUP_MANAGEMENT_ONLY=true
      ;;
    *)
      warn "Please choose 1, 2, or 3."
      return 1
      ;;
  esac
  if [ "$SETUP_MANAGEMENT_ONLY" != true ] && [ -f "$CONFIG_FILE" ]; then
    existing_mode="$(detect_existing_config_mode)"
    [ "$existing_mode" = "$selected_mode" ] || MODE_SWITCHED=true
  fi
  set_setup_mode "$selected_mode"
  if [ "$SETUP_MANAGEMENT_ONLY" = true ]; then
    ok "Managing current mode: $(mode_label)"
  else
    ok "Selected mode: $(mode_label)"
  fi
}

restart_running_service_after_setup_change() {
  [ "$MODE_SWITCHED" = true ] || [ "$YOUTUBE_PLUGIN_UPDATED" = true ] || return 0
  command -v systemctl >/dev/null 2>&1 || return 0
  if ! systemctl is-active --quiet "$SERVICE_NAME" 2>/dev/null; then
    info "Lavalink service is not running, so the updated source will load at its next start."
    return 0
  fi

  info "Lavalink source changed while $SERVICE_NAME is running; restarting it now..."
  sudo_cmd systemctl restart "$SERVICE_NAME"
  sudo_cmd systemctl is-active --quiet "$SERVICE_NAME" || \
    die "Lavalink could not restart after the source update. Inspect: sudo journalctl -u $SERVICE_NAME -n 100"
  ok "Lavalink restarted with $(mode_label)."
  follow_systemd_logs
}

ensure_java() {
  local major package_name before_packages after_packages created_packages

  if command -v java >/dev/null 2>&1; then
    major="$(java_major || true)"
    if [[ "$major" =~ ^[0-9]+$ ]] && (( major >= 17 )); then
      ok "Java $major is ready"
      return
    fi
    warn "Java ${major:-unknown} is too old; Lavalink v4 needs Java 17 or newer."
  else
    warn "Java was not found."
  fi

  command -v apt-get >/dev/null 2>&1 || die "Please install Java 21 manually, then run this script again."
  info "Installing Java 21..."
  sudo_cmd apt-get update

  if sudo_cmd apt-cache show openjdk-21-jre-headless >/dev/null 2>&1; then
    package_name="openjdk-21-jre-headless"
  else
    package_name="default-jre"
    warn "openjdk-21-jre-headless is unavailable in this repository; using default-jre."
  fi

  before_packages="$(mktemp)"
  after_packages="$(mktemp)"
  created_packages="$(mktemp)"
  list_installed_packages > "$before_packages"
  sudo_cmd apt-get install -y "$package_name"
  list_installed_packages > "$after_packages"
  comm -13 "$before_packages" "$after_packages" > "$created_packages"
  record_java_installation "$package_name" "$created_packages"
  rm -f "$before_packages" "$after_packages" "$created_packages"

  major="$(java_major || true)"
  [[ "$major" =~ ^[0-9]+$ ]] && (( major >= 17 )) || die "Java installation did not provide Java 17 or newer."
  ok "Java $major is ready"
}

fetch_url() {
  local url="$1"

  if command -v curl >/dev/null 2>&1; then
    curl -fsSL --retry 2 "$url"
  elif command -v wget >/dev/null 2>&1; then
    wget -qO- "$url"
  else
    die "curl or wget is required to download Lavalink. Install one manually, then run this script again."
  fi
}

is_git_worktree() {
  command -v git >/dev/null 2>&1 \
    && [ "$(git -C "$SCRIPT_DIR" rev-parse --is-inside-work-tree 2>/dev/null || true)" = "true" ]
}

download_setup_update() {
  local filename="$1" destination="$SCRIPT_DIR/$1" temporary_file source_url cache_buster

  cache_buster="$(date +%s)"
  source_url="$SETUP_RAW_BASE/$filename?cache=$cache_buster"
  temporary_file="${destination}.update.$$"
  rm -f "$temporary_file"

  if command -v curl >/dev/null 2>&1; then
    curl -fsSL --retry 2 --connect-timeout 10 --max-time 60 \
      -H 'Cache-Control: no-cache' "$source_url" -o "$temporary_file" || {
        rm -f "$temporary_file"
        return 2
      }
  elif command -v wget >/dev/null 2>&1; then
    wget -q --no-cache -O "$temporary_file" "$source_url" || {
      rm -f "$temporary_file"
      return 2
    }
  else
    return 2
  fi

  [ -s "$temporary_file" ] || {
    rm -f "$temporary_file"
    return 2
  }
  if [ -f "$destination" ] && cmp -s "$destination" "$temporary_file"; then
    rm -f "$temporary_file"
    return 1
  fi

  mv "$temporary_file" "$destination"
  [ "$filename" != "run.sh" ] || chmod 700 "$destination"
  return 0
}

self_update_setup() {
  local filename update_status
  local -a updated_files=()

  case "${LAVALINK_SETUP_SKIP_UPDATE:-}" in
    1|true|TRUE|yes|YES) return ;;
  esac
  if is_git_worktree; then
    info "Git worktree detected; keeping local setup files. Use git pull to update this checkout."
    return
  fi
  if [ ! -f "$SCRIPT_DIR/run.sh" ]; then
    warn "Skipping self-update because run.sh is not installed as a regular file."
    return
  fi

  info "Checking for setup updates..."
  for filename in run.sh example.application.yml example.ytdlp.application.yml; do
    if download_setup_update "$filename"; then
      updated_files+=("$filename")
      continue
    fi
    update_status=$?
    [ "$update_status" -eq 1 ] || warn "Could not update $filename; continuing with the installed copy."
  done

  [ "${#updated_files[@]}" -gt 0 ] || return 0
  ok "Updated setup files: ${updated_files[*]}"
  info "Restarting setup with the latest version..."
  exec env LAVALINK_SETUP_SKIP_UPDATE=1 bash "$SCRIPT_DIR/run.sh" "$@"
}

download_file() {
  local url="$1" destination="$2" temporary_file
  temporary_file="${destination}.download.$$"
  rm -f "$temporary_file"

  info "Downloading $(basename "$destination")..."
  if command -v curl >/dev/null 2>&1; then
    curl -fL --retry 2 --progress-bar "$url" -o "$temporary_file"
  elif command -v wget >/dev/null 2>&1; then
    wget -q --show-progress -O "$temporary_file" "$url"
  else
    die "curl or wget is required to download Lavalink. Install one manually, then run this script again."
  fi

  [ -s "$temporary_file" ] || die "Downloaded file is empty: $(basename "$destination")"
  mv "$temporary_file" "$destination"
  ok "Downloaded $(basename "$destination")"
}

latest_release_asset_url() {
  local api_url="$1" asset_name="$2" release_json url
  release_json="$(fetch_url "$api_url")" || die "Could not read the latest release metadata."
  url="$(printf '%s\n' "$release_json" | sed -nE "s|^[[:space:]]*\"browser_download_url\":[[:space:]]*\"([^\"]*/${asset_name})\"[,]?$|\\1|p" | head -n 1)"
  [ -n "$url" ] || die "Could not find the required release asset: $asset_name"
  printf '%s\n' "$url"
}

latest_youtube_plugin_url() {
  local release_json url
  release_json="$(fetch_url "$YOUTUBE_RELEASE_API")" || die "Could not read YouTube plugin release metadata."
  url="$(printf '%s\n' "$release_json" \
    | sed -nE 's|^[[:space:]]*"browser_download_url":[[:space:]]*"([^"]+)"[,]?$|\1|p' \
    | grep -F "/$YOUTUBE_PLUGIN_ASSET" \
    | head -n 1)"
  [ -n "$url" ] || die "Could not find $YOUTUBE_PLUGIN_ASSET in the fork's ${YOUTUBE_PLUGIN_VERSION} release."
  printf '%s\n' "$url"
}

restore_cached_youtube_plugin() {
  local plugin_file

  compgen -G "$YOUTUBE_PLUGIN_CACHE_DIR/youtube-plugin-*.jar" >/dev/null || return 1
  mkdir -p "$PLUGIN_DIR"
  for plugin_file in "$YOUTUBE_PLUGIN_CACHE_DIR"/youtube-plugin-*.jar; do
    mv -f -- "$plugin_file" "$PLUGIN_DIR/"
  done
  rmdir "$YOUTUBE_PLUGIN_CACHE_DIR" 2>/dev/null || true
  rmdir "$MODE_ASSET_DIR" 2>/dev/null || true
  ok "Restored the cached mode-1 youtube-source plugin."
}

park_youtube_plugin_for_ytdlp_mode() {
  local plugin_file

  compgen -G "$PLUGIN_DIR/youtube-plugin-*.jar" >/dev/null || return 0
  mkdir -p "$YOUTUBE_PLUGIN_CACHE_DIR"
  for plugin_file in "$PLUGIN_DIR"/youtube-plugin-*.jar; do
    mv -f -- "$plugin_file" "$YOUTUBE_PLUGIN_CACHE_DIR/"
  done
  ok "Stored the mode-1 youtube-source plugin for a later switch back."
}

download_missing_runtime() {
  local url ytdlp_url plugin_file expected_plugin="$PLUGIN_DIR/$YOUTUBE_PLUGIN_ASSET"

  header "Download Lavalink and plugins"

  if [ -s "$JAR_FILE" ]; then
    ok "Lavalink.jar already exists; keeping the current version"
  else
    url="$(latest_release_asset_url "$LAVALINK_RELEASE_API" 'Lavalink\.jar')"
    download_file "$url" "$JAR_FILE"
  fi

  case "$SETUP_MODE" in
    plugin)
      mkdir -p "$PLUGIN_DIR"
      if [ -s "$expected_plugin" ]; then
        ok "youtube-source plugin $YOUTUBE_PLUGIN_VERSION already exists; keeping it"
      elif [ -s "$YOUTUBE_PLUGIN_CACHE_DIR/$YOUTUBE_PLUGIN_ASSET" ]; then
        mv -f -- "$YOUTUBE_PLUGIN_CACHE_DIR/$YOUTUBE_PLUGIN_ASSET" "$expected_plugin"
        YOUTUBE_PLUGIN_UPDATED=true
        ok "Restored cached youtube-source plugin $YOUTUBE_PLUGIN_VERSION"
      else
        url="$(latest_youtube_plugin_url)"
        download_file "$url" "$expected_plugin"
        YOUTUBE_PLUGIN_UPDATED=true
      fi
      # Do not let Lavalink load an older youtube-source alongside 1.18.3.
      for plugin_file in "$PLUGIN_DIR"/youtube-plugin-*.jar; do
        [ -e "$plugin_file" ] || continue
        if [ "$plugin_file" != "$expected_plugin" ]; then
          rm -f -- "$plugin_file"
          YOUTUBE_PLUGIN_UPDATED=true
        fi
      done
      info "LavaSrc is declared in application.yml and Lavalink downloads it automatically on first start."
      ;;
    ytdlp)
      mkdir -p "$BIN_DIR"
      if [ -x "$YTDLP_FILE" ]; then
        ok "yt-dlp already exists; keeping the current version"
      else
        case "$(uname -m)" in
          x86_64|amd64) ytdlp_url="$YTDLP_RELEASE_URL/yt-dlp_linux" ;;
          aarch64|arm64) ytdlp_url="$YTDLP_RELEASE_URL/yt-dlp_linux_aarch64" ;;
          *) die "yt-dlp mode supports x86_64 and arm64 only; install yt-dlp manually, then place it at $YTDLP_FILE." ;;
        esac
        download_file "$ytdlp_url" "$YTDLP_FILE"
        chmod 755 "$YTDLP_FILE"
      fi
      info "LavaSrc is declared in application.yml and Lavalink downloads it automatically on first start."
      ;;
  esac
}

validate_port() {
  [[ "$1" =~ ^[0-9]{1,5}$ ]] && (( 10#$1 >= 1 && 10#$1 <= 65535 ))
}

escape_sed_replacement() {
  # Escape a value for both a double-quoted YAML scalar and sed replacement.
  printf '%s' "$1" | sed -e 's/[\\&|"]/\\&/g'
}

check_template() {
  [ -f "$TEMPLATE_FILE" ] || die "Missing template: $TEMPLATE_FILE"
}

check_runtime_files() {
  check_template
  [ -s "$JAR_FILE" ] || die "Missing Lavalink.jar. Upload it to $SCRIPT_DIR, then run this script again."

  case "$SETUP_MODE" in
    plugin)
      if ! compgen -G "$PLUGIN_DIR/youtube-plugin-*.jar" >/dev/null; then
        die "Missing youtube-source plugin. Run the setup script again to download it."
      fi
      ;;
    ytdlp)
      [ -x "$YTDLP_FILE" ] || die "Missing yt-dlp. Run the setup script again to download it."
      ;;
  esac
}

configure_application() {
  local port password escaped_port escaped_password escaped_ytdlp_path
  local existing_mode backup_file temporary_config previous_port previous_password config_source

  header "Configure application.yml"
  if [ -f "$CONFIG_FILE" ]; then
    existing_mode="$(detect_existing_config_mode)"
    previous_port="$(awk '
      /^server:[[:space:]]*$/ { in_server = 1; next }
      in_server && /^[^[:space:]]/ { exit }
      in_server && /^  port:[[:space:]]*[0-9]+[[:space:]]*$/ {
        value = $0
        sub(/^[[:space:]]*port:[[:space:]]*/, "", value)
        sub(/[[:space:]]*$/, "", value)
        print value
        exit
      }
    ' "$CONFIG_FILE" || true)"
    previous_password="$(awk '
      /^lavalink:[[:space:]]*$/ { in_lavalink = 1; next }
      in_lavalink && /^[^[:space:]]/ { exit }
      in_lavalink && /^  server:[[:space:]]*$/ { in_lavalink_server = 1; next }
      in_lavalink_server && /^  [^[:space:]]/ { exit }
      in_lavalink_server && /^    password:[[:space:]]*/ {
        value = $0
        sub(/^[[:space:]]*password:[[:space:]]*/, "", value)
        sub(/[[:space:]]*$/, "", value)
        if (value ~ /^".*"$/) {
          sub(/^"/, "", value)
          sub(/"$/, "", value)
        }
        print value
        exit
      }
    ' "$CONFIG_FILE" || true)"
    validate_port "$previous_port" || previous_port=3333
    [ -n "$previous_password" ] || previous_password="takeshi.dev"

    if [ "$existing_mode" != "$SETUP_MODE" ]; then
      warn "Switching application.yml from $existing_mode to $SETUP_MODE mode."
      info "The old configuration will be backed up before the selected mode is created."
    fi
  else
    previous_port="3333"
    previous_password="takeshi.dev"
  fi

  # Always present the current values. Pressing Enter preserves them; entering
  # a value makes it easy to amend the Lavalink port/password on a later run.
  read_tty "Lavalink port [$previous_port]: "
  port="${REPLY:-$previous_port}"
  validate_port "$port" || die "Invalid port: $port"

  read_tty "Lavalink password [$previous_password]: " true
  password="${REPLY:-$previous_password}"

  escaped_port="$(escape_sed_replacement "$port")"
  escaped_password="$(escape_sed_replacement "$password")"
  escaped_ytdlp_path="$(escape_sed_replacement "$YTDLP_FILE")"
  temporary_config="${CONFIG_FILE}.tmp.$$"
  config_source="$TEMPLATE_FILE"
  if [ -n "${existing_mode:-}" ] && [ "$existing_mode" = "$SETUP_MODE" ]; then
    config_source="$CONFIG_FILE"
  fi
  sed \
    -e "0,/^  port: [0-9][0-9]*[[:space:]]*$/s|^  port: [0-9][0-9]*[[:space:]]*$|  port: $escaped_port|" \
    -e "0,/^    password: .*[[:space:]]*$/s|^    password: .*[[:space:]]*$|    password: \"$escaped_password\"|" \
    -e "s|__YTDLP_PATH__|$escaped_ytdlp_path|g" \
    "$config_source" > "$temporary_config"

  [ -s "$temporary_config" ] || die "Could not create application.yml from $(basename "$TEMPLATE_FILE")."
  if [ -n "${existing_mode:-}" ] && [ "$existing_mode" = "$SETUP_MODE" ]; then
    if cmp -s "$CONFIG_FILE" "$temporary_config"; then
      rm -f "$temporary_config"
      ok "application.yml is unchanged."
    else
      mv "$temporary_config" "$CONFIG_FILE"
      chmod 600 "$CONFIG_FILE"
      ok "Updated the Lavalink port/password in application.yml."
    fi
    state_set "SETUP_MODE" "$SETUP_MODE"
    return
  fi
  if [ -n "${existing_mode:-}" ] && [ "$existing_mode" != "$SETUP_MODE" ]; then
    backup_file="$SCRIPT_DIR/application.yml.${existing_mode}-backup-$(date +%Y%m%d-%H%M%S)"
    cp -p -- "$CONFIG_FILE" "$backup_file"
    chmod 600 "$backup_file"
    ok "Backed up the previous configuration to $(basename "$backup_file")"
  fi
  mv "$temporary_config" "$CONFIG_FILE"

  chmod 600 "$CONFIG_FILE"
  state_set "SETUP_MODE" "$SETUP_MODE"
  ok "Created application.yml from $(basename "$TEMPLATE_FILE")"
  if [ -n "${existing_mode:-}" ] && [ "$existing_mode" != "$SETUP_MODE" ]; then
    info "Mode-specific runtime files are kept locally for future switches."
  fi
  if [ "$SETUP_MODE" = ytdlp ]; then
    # Keep youtube-source out of ./plugins while using yt-dlp mode. Lavalink
    # loads every JAR in that directory, so merely disabling it in YAML is not
    # enough to guarantee mode 2 remains yt-dlp-only.
    park_youtube_plugin_for_ytdlp_mode
  fi
  if [ "$SETUP_MODE" = plugin ]; then
    warn "Before starting, add your YouTube OAuth refresh token and Spotify credentials to application.yml if you use those sources."
  else
    warn "Before starting, add Spotify credentials to application.yml if you use Spotify links."
  fi
}

migrate_ytdlp_compatibility_config() {
  local temporary_config

  # This migration applies only to mode 2. Returning success here matters
  # because the setup script intentionally runs with `set -e`.
  [ "$SETUP_MODE" = ytdlp ] || return 0
  [ -f "$CONFIG_FILE" ] || return 0

  # Older mode-2 templates enabled YouTube lyrics. LavaSrc implements those
  # through LavaSearch, which requires youtube-source and prevents a yt-dlp-only
  # node from booting. Update only that known generated setting.
  temporary_config="${CONFIG_FILE}.tmp.$$"
  awk '
    /^    lyrics-sources:[[:space:]]*$/ { in_lyrics_sources = 1 }
    in_lyrics_sources && !/^    lyrics-sources:[[:space:]]*$/ && /^    [A-Za-z0-9_-]+:[[:space:]]*$/ { in_lyrics_sources = 0 }
    in_lyrics_sources && /^      youtube:[[:space:]]*true[[:space:]]*$/ {
      sub(/true[[:space:]]*$/, "false")
    }
    { print }
  ' "$CONFIG_FILE" > "$temporary_config"

  if ! cmp -s "$CONFIG_FILE" "$temporary_config"; then
    mv "$temporary_config" "$CONFIG_FILE"
    chmod 600 "$CONFIG_FILE"
    ok "Updated mode-2 configuration: disabled YouTube LavaSearch lyrics."
  else
    rm -f "$temporary_config"
  fi
}

proxy_uri_decode() {
  local encoded="$1" decoded

  [[ "$encoded" =~ ^([^%]|%[0-9A-Fa-f]{2})*$ ]] || die "The SOCKS5 URI contains an invalid percent escape."
  printf -v decoded '%b' "${encoded//%/\\x}"
  [[ "$decoded" != *$'\n'* && "$decoded" != *$'\r'* ]] || die "The SOCKS5 URI contains an invalid line break."
  printf '%s' "$decoded"
}

proxy_uri_encode() {
  local value="$1" encoded="" character byte index
  local LC_ALL=C

  for ((index = 0; index < ${#value}; index += 1)); do
    character="${value:index:1}"
    case "$character" in
      [A-Za-z0-9.~_-]) encoded+="$character" ;;
      *)
        printf -v byte '%02X' "'$character"
        encoded+="%$byte"
        ;;
    esac
  done
  printf '%s' "$encoded"
}

parse_compact_proxy_authority() {
  local authority="$1" compact_host compact_port compact_username compact_password compact_extra remainder

  remainder="${authority#*:}"
  if [[ "$authority" == *:* && "$remainder" != *:* ]]; then
    PROXY_HOST="${authority%:*}"
    PROXY_PORT="${authority##*:}"
    PROXY_USERNAME=""
    PROXY_PASSWORD=""
    return
  fi

  IFS=':' read -r compact_host compact_port compact_username compact_password compact_extra <<< "$authority"
  [ -n "$compact_host" ] && [ -n "$compact_port" ] \
    && [ -n "$compact_username" ] && [ -n "$compact_password" ] \
    && [ -z "$compact_extra" ] || \
    die "Proxy must use scheme://user:password@host:port, host:port, or host:port:username:password."
  PROXY_HOST="$compact_host"
  PROXY_PORT="$compact_port"
  PROXY_USERNAME="$compact_username"
  PROXY_PASSWORD="$compact_password"
}

set_proxy_protocol() {
  local scheme="$1"

  case "$scheme" in
    socks5|socks5h)
      PROXY_REDSOCKS_TYPE="socks5"
      PROXY_LABEL="SOCKS5"
      ;;
    http)
      PROXY_REDSOCKS_TYPE="http-connect"
      PROXY_LABEL="HTTP CONNECT"
      ;;
    *) die "Unsupported proxy protocol: $scheme" ;;
  esac
}

build_proxy_uri() {
  local scheme="$1"

  if [ -n "$PROXY_USERNAME" ]; then
    printf '%s://%s:%s@%s:%s' \
      "$scheme" \
      "$(proxy_uri_encode "$PROXY_USERNAME")" \
      "$(proxy_uri_encode "$PROXY_PASSWORD")" \
      "$PROXY_HOST" \
      "$PROXY_PORT"
  else
    printf '%s://%s:%s' "$scheme" "$PROXY_HOST" "$PROXY_PORT"
  fi
}

parse_proxy() {
  local uri="$1" authority credentials host_port encoded_username encoded_password
  local canonical_scheme compact_authority=false

  PROXY_HOST=""
  PROXY_PORT=""
  PROXY_USERNAME=""
  PROXY_PASSWORD=""
  PROXY_AUTO_DETECT=false
  set_proxy_protocol socks5

  case "$uri" in
    socks5://*)
      authority="${uri#socks5://}"
      canonical_scheme="socks5"
      set_proxy_protocol "$canonical_scheme"
      ;;
    socks5h://*)
      authority="${uri#socks5h://}"
      canonical_scheme="socks5h"
      set_proxy_protocol "$canonical_scheme"
      ;;
    http://*)
      authority="${uri#http://}"
      canonical_scheme="http"
      set_proxy_protocol "$canonical_scheme"
      ;;
    *)
      # Provider values normally omit their protocol. The connectivity check
      # will detect SOCKS5 first, then HTTP CONNECT, before anything is saved.
      authority="$uri"
      canonical_scheme="socks5h"
      compact_authority=true
      PROXY_AUTO_DETECT=true
      ;;
  esac

  [ -n "$authority" ] || die "The proxy value is empty."
  [[ "$authority" != *['/?#']* ]] || die "Use a proxy URI without a path, query string, or fragment."

  if [ "$compact_authority" = true ] || [[ "$authority" != *@* ]]; then
    parse_compact_proxy_authority "$authority"
    compact_authority=true
  else
    credentials="${authority%@*}"
    host_port="${authority##*@}"
    [[ "$credentials" == *:* ]] || die "The proxy username and password must be separated with ':'."
    encoded_username="${credentials%%:*}"
    encoded_password="${credentials#*:}"
    [ -n "$encoded_username" ] && [ -n "$encoded_password" ] || die "The proxy username and password cannot be empty."
    PROXY_USERNAME="$(proxy_uri_decode "$encoded_username")"
    PROXY_PASSWORD="$(proxy_uri_decode "$encoded_password")"
    [[ "$host_port" == *:* ]] || die "The proxy URI must include host:port."
    PROXY_HOST="${host_port%:*}"
    PROXY_PORT="${host_port##*:}"
  fi

  [[ "$PROXY_HOST" =~ ^[A-Za-z0-9]([A-Za-z0-9.-]*[A-Za-z0-9])?$ ]] || die "The proxy host must be an IPv4 address or hostname."
  validate_port "$PROXY_PORT" || die "Invalid proxy port: $PROXY_PORT"
  [[ "$PROXY_USERNAME" != *['"\\;']* && "$PROXY_PASSWORD" != *['"\\;']* ]] || \
    die "For safety, percent-encoded proxy credentials may not decode to quote, backslash, or semicolon characters."

  if [ "$compact_authority" = false ]; then
    PROXY_URI="$uri"
  else
    PROXY_URI="$(build_proxy_uri "$canonical_scheme")"
  fi
}

load_proxy_settings() {
  local stored_uri

  [ -f "$PROXY_SETTINGS_FILE" ] || return 1
  stored_uri="$(awk -F= '/^PROXY_URI=/ { print substr($0, 11); exit }' "$PROXY_SETTINGS_FILE")"
  [ -n "$stored_uri" ] || die "The saved proxy configuration is invalid. Remove $PROXY_SETTINGS_FILE and run setup again."
  parse_proxy "$stored_uri"
}

proxy_profile_is_saved() {
  load_proxy_settings
}

proxy_is_enabled() {
  local saved_state

  load_proxy_settings || return 1
  # Older setup files predate this toggle. Keep their existing proxy behavior
  # until the operator explicitly turns it off.
  saved_state="$(state_get "PROXY_ENABLED")"
  case "${saved_state:-true}" in
    false|off|OFF|0|no|NO)
      return 1
      ;;
    *)
      return 0
      ;;
  esac
}

show_proxy_menu_status() {
  local proxy_state="OFF" runtime_state="not running"

  if ! proxy_profile_is_saved; then
    info "Proxy: OFF (not configured)"
    return 0
  fi

  if proxy_is_enabled; then
    proxy_state="ON"
  fi
  if proxy_redirection_rule_is_active; then
    if proxy_runtime_services_are_active; then
      runtime_state="active"
    else
      runtime_state="routing rule active, but one or more proxy services are inactive"
    fi
  elif proxy_any_runtime_service_is_active; then
    runtime_state="services active, routing rule missing"
  fi
  info "Proxy: configured $proxy_state | runtime $runtime_state | $PROXY_LABEL $PROXY_HOST:$PROXY_PORT"
}

check_proxy_connection() {
  local egress_ip candidate_scheme candidate_uri

  command -v curl >/dev/null 2>&1 || die "curl is required to verify the proxy. Install curl, then run setup again."
  if [ "$PROXY_AUTO_DETECT" = true ]; then
    info "Detecting proxy type: trying SOCKS5, then HTTP CONNECT..."
    for candidate_scheme in socks5h http; do
      candidate_uri="$(build_proxy_uri "$candidate_scheme")"
      egress_ip="$(curl -4fsS --proxy "$candidate_uri" --connect-timeout 8 --max-time 12 https://api.ipify.org 2>/dev/null)" || continue
      [[ "$egress_ip" =~ ^[0-9A-Fa-f:.]+$ ]] || continue
      PROXY_URI="$candidate_uri"
      PROXY_AUTO_DETECT=false
      set_proxy_protocol "$candidate_scheme"
      ok "Detected $PROXY_LABEL proxy (egress IP: $egress_ip)"
      return
    done
    die "The proxy could not be reached as SOCKS5 or HTTP CONNECT. Check its host, port, credentials, firewall, and HTTP CONNECT support."
  fi

  info "Checking $PROXY_LABEL proxy connectivity..."
  egress_ip="$(curl -4fsS --proxy "$PROXY_URI" --connect-timeout 10 --max-time 25 https://api.ipify.org)" || \
    die "The proxy could not reach the internet. Check its type, host, port, credentials, CONNECT support, and firewall."
  [[ "$egress_ip" =~ ^[0-9A-Fa-f:.]+$ ]] || die "The proxy check returned an invalid egress address."
  ok "$PROXY_LABEL proxy check succeeded (egress IP: $egress_ip)"
}

save_proxy_settings() {
  local temporary_file
  temporary_file="${PROXY_SETTINGS_FILE}.tmp.$$"
  (
    umask 077
    printf 'PROXY_URI=%s\n' "$PROXY_URI"
  ) > "$temporary_file"
  mv "$temporary_file" "$PROXY_SETTINGS_FILE"
  chmod 600 "$PROXY_SETTINGS_FILE"
  state_set "PROXY_ENABLED" "true"
}

configure_optional_proxy() {
  local mode="${1:-initial}" configure_proxy

  header "Optional HTTP / SOCKS5 proxy"
  if proxy_profile_is_saved; then
    if proxy_is_enabled; then
      ok "A saved $PROXY_LABEL proxy is enabled for Lavalink TCP traffic."
    else
      warn "A saved $PROXY_LABEL proxy exists but is currently OFF."
    fi
    if [ "$mode" != "replace" ]; then
      info "Choose menu option 7 to turn it on/off or replace its URI."
      return
    fi
    info "Enter the replacement URI below. It will be checked before the saved proxy is updated."
  else
    if [ "$mode" = "replace" ]; then
      info "No saved proxy exists yet; enter an HTTP or SOCKS5 proxy below to create one."
    else
      read_tty "Set up a transparent HTTP / SOCKS5 proxy for Lavalink? [y/N]: "
      configure_proxy="${REPLY:-N}"
      case "$configure_proxy" in
        y|Y|yes|YES) ;;
        n|N|no|NO|'')
          state_set "PROXY_ENABLED" "false"
          info "No proxy will be used."
          return
          ;;
        *) die "Please answer y or n." ;;
      esac
    fi
  fi

  # This is intentionally visible: it lets the operator verify the full URI
  # before the connectivity check. The saved file is still permission 600.
  read_tty "Proxy (host:port:user:password or URI): "
  [ -n "$REPLY" ] || die "A proxy value is required when proxy setup is enabled."
  parse_proxy "$REPLY"
  check_proxy_connection
  save_proxy_settings
  ok "The $PROXY_LABEL proxy was saved with owner-only file permissions."
}

manage_saved_proxy() {
  local action current_state="OFF"

  header "Manage saved HTTP / SOCKS5 proxy"
  if proxy_profile_is_saved; then
    if proxy_is_enabled; then
      current_state="ON"
    fi
    info "A proxy URI is saved and its current state is $current_state."
  else
    warn "No saved proxy URI exists yet. Choose option 3 to enter one."
  fi

  echo "1) Turn proxy ON"
  echo "2) Turn proxy OFF"
  echo "3) Replace proxy"
  echo "0) Back"
  read_tty "Choose [0]: "
  action="${REPLY:-}"
  case "$action" in
    1)
      if ! proxy_profile_is_saved; then
        warn "No saved proxy exists. Choose option 3 and enter a proxy first."
        return
      fi
      assert_manageable_lavalink_unit_for_proxy
      check_proxy_connection
      state_set "PROXY_ENABLED" "true"
      apply_saved_proxy_state
      if proxy_redirection_rule_is_active; then
        ok "Saved $PROXY_LABEL proxy is ON and its runtime state has been applied."
      else
        ok "Saved $PROXY_LABEL proxy is ON; it will start with the next Lavalink test or systemd install."
      fi
      ;;
    2)
      if ! proxy_profile_is_saved; then
        warn "No saved proxy exists to turn off."
        return
      fi
      assert_manageable_lavalink_unit_for_proxy
      state_set "PROXY_ENABLED" "false"
      apply_saved_proxy_state
      ok "Saved $PROXY_LABEL proxy is OFF; its routing is stopped and its URI remains saved."
      ;;
    3)
      assert_manageable_lavalink_unit_for_proxy
      configure_optional_proxy replace
      apply_saved_proxy_state
      if proxy_redirection_rule_is_active; then
        ok "The replacement proxy is saved and active."
      else
        ok "The replacement proxy is saved; it will start with the next Lavalink test or systemd install."
      fi
      ;;
    0|'') info "Proxy settings unchanged." ;;
    *) warn "Please choose a number from 0 to 3." ;;
  esac
}

configured_lavalink_port() {
  local current_port

  if [ ! -f "$CONFIG_FILE" ]; then
    printf '%s\n' "3333"
    return
  fi

  current_port="$(awk '
    /^server:[[:space:]]*$/ { in_server = 1; next }
    in_server && /^[^[:space:]]/ { exit }
    in_server && /^  port:[[:space:]]*[0-9]+[[:space:]]*$/ {
      value = $0
      sub(/^[[:space:]]*port:[[:space:]]*/, "", value)
      sub(/[[:space:]]*$/, "", value)
      print value
      exit
    }
  ' "$CONFIG_FILE" || true)"
  validate_port "$current_port" || current_port="3333"
  printf '%s\n' "$current_port"
}

validate_cloudflare_hostname() {
  local hostname="$1"

  [[ "$hostname" =~ ^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$ ]]
}

normalise_cloudflare_hostname() {
  local hostname="$1"
  hostname="${hostname,,}"
  [[ "$hostname" != *://* && "$hostname" != */* && "$hostname" != *:* ]] || \
    die "Enter only a hostname, for example lavalink.example.com (without https:// or a port)."
  validate_cloudflare_hostname "$hostname" || die "Invalid Cloudflare hostname: $hostname"
  printf '%s\n' "$hostname"
}

cloudflare_setting_get() {
  local key="$1"
  [ -f "$CF_TUNNEL_SETTINGS_FILE" ] || return 0
  awk -F= -v key="$key" '$1 == key { value = substr($0, length(key) + 2) } END { if (value != "") print value }' "$CF_TUNNEL_SETTINGS_FILE"
}

load_cloudflare_tunnel_settings() {
  [ -f "$CF_TUNNEL_SETTINGS_FILE" ] || return 1

  CF_TUNNEL_ID="$(cloudflare_setting_get "TUNNEL_ID")"
  CF_TUNNEL_NAME="$(cloudflare_setting_get "TUNNEL_NAME")"
  CF_TUNNEL_HOSTNAME="$(cloudflare_setting_get "HOSTNAME")"
  CF_TUNNEL_SERVICE_USER="$(cloudflare_setting_get "SERVICE_USER")"
  CF_TUNNEL_CREDENTIALS_FILE="$(cloudflare_setting_get "CREDENTIALS_FILE")"

  [[ "$CF_TUNNEL_ID" =~ ^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$ ]] || \
    die "The saved Cloudflare Tunnel ID is invalid. Remove $CF_TUNNEL_SETTINGS_FILE and configure it again."
  [[ "$CF_TUNNEL_NAME" =~ ^[A-Za-z0-9_-]+$ ]] || \
    die "The saved Cloudflare Tunnel name is invalid. Remove $CF_TUNNEL_SETTINGS_FILE and configure it again."
  validate_cloudflare_hostname "$CF_TUNNEL_HOSTNAME" || \
    die "The saved Cloudflare hostname is invalid. Remove $CF_TUNNEL_SETTINGS_FILE and configure it again."
  id -u "$CF_TUNNEL_SERVICE_USER" >/dev/null 2>&1 || \
    die "The saved Cloudflare service user no longer exists: $CF_TUNNEL_SERVICE_USER"
  [[ "$CF_TUNNEL_CREDENTIALS_FILE" = /* && "$CF_TUNNEL_CREDENTIALS_FILE" != *$'\n'* ]] || \
    die "The saved Cloudflare credentials path is invalid. Remove $CF_TUNNEL_SETTINGS_FILE and configure it again."
}

cloudflare_tunnel_profile_is_saved() {
  load_cloudflare_tunnel_settings
}

cloudflare_tunnel_is_enabled() {
  local saved_state

  load_cloudflare_tunnel_settings || return 1
  saved_state="$(state_get "CLOUDFLARE_TUNNEL_ENABLED")"
  case "${saved_state:-true}" in
    false|off|OFF|0|no|NO)
      return 1
      ;;
    *) return 0 ;;
  esac
}

show_cloudflare_tunnel_menu_status() {
  local tunnel_state="OFF" runtime_state="unknown" local_port

  if ! cloudflare_tunnel_profile_is_saved; then
    info "Cloudflare Tunnel: OFF (not configured)"
    return 0
  fi
  if cloudflare_tunnel_is_enabled; then
    tunnel_state="ON"
  fi
  if command -v systemctl >/dev/null 2>&1; then
    if sudo_cmd systemctl is-active --quiet "$TUNNEL_SERVICE_NAME"; then
      runtime_state="active"
    else
      runtime_state="inactive"
    fi
  fi
  local_port="$(configured_lavalink_port)"
  info "Cloudflare Tunnel: configured $tunnel_state | runtime $runtime_state | https://$CF_TUNNEL_HOSTNAME -> 127.0.0.1:$local_port"
}

cloudflare_service_user_home() {
  local service_user="$1" service_home

  service_home="$(getent passwd "$service_user" 2>/dev/null | awk -F: 'NR == 1 { print $6 }')"
  [ -n "$service_home" ] && [ -d "$service_home" ] || \
    die "Could not determine a valid home directory for Cloudflare service user: $service_user"
  printf '%s\n' "$service_home"
}

run_cloudflared_as_service_user() {
  local service_user="$1" service_home
  shift
  service_home="$(cloudflare_service_user_home "$service_user")"

  if [ "$(id -un)" = "$service_user" ]; then
    HOME="$service_home" "$@"
  else
    sudo_cmd runuser -u "$service_user" -- env "HOME=$service_home" "$@"
  fi
}

ensure_cloudflared() {
  local cloudflared_url

  if [ -x "$CLOUDFLARED_FILE" ]; then
    ok "cloudflared already exists; keeping the current version"
    return
  fi

  mkdir -p "$BIN_DIR"
  case "$(uname -m)" in
    x86_64|amd64) cloudflared_url="https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64" ;;
    aarch64|arm64) cloudflared_url="https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-arm64" ;;
    *) die "Cloudflare Tunnel setup supports x86_64 and arm64 only; install cloudflared manually at $CLOUDFLARED_FILE." ;;
  esac

  info "Downloading cloudflared..."
  download_file "$cloudflared_url" "$CLOUDFLARED_FILE"
  chmod 755 "$CLOUDFLARED_FILE"
  "$CLOUDFLARED_FILE" --version >/dev/null 2>&1 || die "The downloaded cloudflared binary could not start."
  ok "cloudflared is ready"
}

cloudflare_tunnel_name_for_hostname() {
  local hostname="$1" base
  base="${hostname//./-}"
  base="${base:0:48}"
  printf 'lavalink-%s-%s\n' "$base" "$(date +%s)"
}

ensure_cloudflare_login() {
  local service_user="$1" service_home="$2" certificate_file
  certificate_file="$service_home/.cloudflared/cert.pem"

  if [ -s "$certificate_file" ]; then
    ok "A Cloudflare login certificate already exists for user $service_user"
    return
  fi

  warn "Cloudflare authorization is required once for this VPS user."
  info "cloudflared will print a URL below. Open it on any browser, sign in, choose the zone containing your hostname, then return here."
  run_cloudflared_as_service_user "$service_user" "$CLOUDFLARED_FILE" tunnel login
  [ -s "$certificate_file" ] || die "Cloudflare login did not create $certificate_file. Complete the browser authorization, then try again."
  ok "Cloudflare authorization completed"
}

create_cloudflare_tunnel() {
  local service_user="$1" service_home="$2" tunnel_name="$3" create_output credentials_candidate

  if ! create_output="$(run_cloudflared_as_service_user "$service_user" "$CLOUDFLARED_FILE" tunnel create "$tunnel_name" 2>&1)"; then
    printf '%s\n' "$create_output" >&2
    warn "Cloudflare could not create tunnel $tunnel_name. It may already exist; choose a different hostname and try again."
    return 1
  fi
  printf '%s\n' "$create_output"

  CF_TUNNEL_ID="$(printf '%s\n' "$create_output" | grep -Eo '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}' | tail -n 1 || true)"
  [[ "$CF_TUNNEL_ID" =~ ^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$ ]] || \
    die "cloudflared created a tunnel but its UUID could not be read safely. Check 'cloudflared tunnel list' before retrying."
  CF_TUNNEL_NAME="$tunnel_name"
  CF_TUNNEL_SERVICE_USER="$service_user"
  CF_TUNNEL_CREDENTIALS_FILE="$service_home/.cloudflared/$CF_TUNNEL_ID.json"
  if [ ! -s "$CF_TUNNEL_CREDENTIALS_FILE" ]; then
    credentials_candidate="$(find "$service_home/.cloudflared" -maxdepth 1 -type f -name "$CF_TUNNEL_ID.json" -print -quit 2>/dev/null || true)"
    [ -n "$credentials_candidate" ] && CF_TUNNEL_CREDENTIALS_FILE="$credentials_candidate"
  fi
  [ -s "$CF_TUNNEL_CREDENTIALS_FILE" ] || \
    die "Cloudflare did not create the tunnel credentials file for $CF_TUNNEL_ID."
}

save_cloudflare_tunnel_settings() {
  local temporary_file service_group
  service_group="$(id -gn "$CF_TUNNEL_SERVICE_USER" 2>/dev/null || printf '%s' "$CF_TUNNEL_SERVICE_USER")"
  temporary_file="$(mktemp)"
  (
    umask 077
    printf 'TUNNEL_ID=%s\n' "$CF_TUNNEL_ID"
    printf 'TUNNEL_NAME=%s\n' "$CF_TUNNEL_NAME"
    printf 'HOSTNAME=%s\n' "$CF_TUNNEL_HOSTNAME"
    printf 'SERVICE_USER=%s\n' "$CF_TUNNEL_SERVICE_USER"
    printf 'CREDENTIALS_FILE=%s\n' "$CF_TUNNEL_CREDENTIALS_FILE"
  ) > "$temporary_file"
  sudo_cmd install -d -o "$CF_TUNNEL_SERVICE_USER" -g "$service_group" -m 700 "$CF_TUNNEL_DIR"
  sudo_cmd install -o "$CF_TUNNEL_SERVICE_USER" -g "$service_group" -m 600 "$temporary_file" "$CF_TUNNEL_SETTINGS_FILE"
  rm -f "$temporary_file"
  state_set "CLOUDFLARE_TUNNEL_ENABLED" "true"
}

route_cloudflare_hostname() {
  if ! run_cloudflared_as_service_user "$CF_TUNNEL_SERVICE_USER" "$CLOUDFLARED_FILE" tunnel route dns "$CF_TUNNEL_ID" "$CF_TUNNEL_HOSTNAME"; then
    warn "Cloudflare did not create DNS route for $CF_TUNNEL_HOSTNAME. Check that the domain is active in this Cloudflare account and that the hostname is unused."
    return 1
  fi
  ok "Cloudflare DNS route created: $CF_TUNNEL_HOSTNAME"
}

write_cloudflare_tunnel_config() {
  local service_group temporary_file local_port

  load_cloudflare_tunnel_settings
  [ -s "$CF_TUNNEL_CREDENTIALS_FILE" ] || \
    die "Cloudflare tunnel credentials are missing: $CF_TUNNEL_CREDENTIALS_FILE"
  service_group="$(id -gn "$CF_TUNNEL_SERVICE_USER" 2>/dev/null || printf '%s' "$CF_TUNNEL_SERVICE_USER")"
  local_port="$(configured_lavalink_port)"
  temporary_file="$(mktemp)"
  (
    umask 077
    cat <<EOF
tunnel: $CF_TUNNEL_ID
credentials-file: $CF_TUNNEL_CREDENTIALS_FILE

ingress:
  - hostname: $CF_TUNNEL_HOSTNAME
    service: http://127.0.0.1:$local_port
  - service: http_status:404
EOF
  ) > "$temporary_file"

  sudo_cmd install -d -o "$CF_TUNNEL_SERVICE_USER" -g "$service_group" -m 700 "$CF_TUNNEL_DIR"
  sudo_cmd install -o "$CF_TUNNEL_SERVICE_USER" -g "$service_group" -m 600 "$temporary_file" "$CF_TUNNEL_CONFIG_FILE"
  rm -f "$temporary_file"
  run_cloudflared_as_service_user "$CF_TUNNEL_SERVICE_USER" "$CLOUDFLARED_FILE" tunnel --config "$CF_TUNNEL_CONFIG_FILE" ingress validate >/dev/null || \
    die "The generated Cloudflare Tunnel ingress configuration is invalid."
}

managed_cloudflare_tunnel_service_file() {
  printf '/etc/systemd/system/%s.service\n' "$TUNNEL_SERVICE_NAME"
}

assert_manageable_cloudflare_tunnel_service() {
  local service_file
  service_file="$(managed_cloudflare_tunnel_service_file)"
  command -v systemctl >/dev/null 2>&1 || die "systemd is required to manage Cloudflare Tunnel."
  if [ -f "$service_file" ]; then
    sudo_cmd grep -Fqx "$MANAGED_SERVICE_MARKER" "$service_file" || \
      die "Cloudflare Tunnel service is not managed by this setup; its settings were not changed."
  elif sudo_cmd systemctl cat "$TUNNEL_SERVICE_NAME" >/dev/null 2>&1; then
    die "A Cloudflare Tunnel service exists outside this setup directory; its settings were not changed."
  fi
}

ensure_cloudflare_tunnel_runtime() {
  local service_file

  cloudflare_tunnel_is_enabled || return 0
  command -v systemctl >/dev/null 2>&1 || die "systemd is required to run Cloudflare Tunnel automatically."
  ensure_cloudflared
  write_cloudflare_tunnel_config
  service_file="$(managed_cloudflare_tunnel_service_file)"
  if [ -f "$service_file" ] && ! sudo_cmd grep -Fqx "$MANAGED_SERVICE_MARKER" "$service_file"; then
    die "Refusing to overwrite unmanaged Cloudflare Tunnel service: $service_file"
  fi

  sudo_cmd tee "$service_file" >/dev/null <<EOF
[Unit]
Description=Cloudflare Tunnel for Lavalink
After=network-online.target
Wants=network-online.target

$MANAGED_SERVICE_MARKER

[Service]
Type=simple
User=$CF_TUNNEL_SERVICE_USER
Group=$(id -gn "$CF_TUNNEL_SERVICE_USER" 2>/dev/null || printf '%s' "$CF_TUNNEL_SERVICE_USER")
ExecStart=$CLOUDFLARED_FILE tunnel --config $CF_TUNNEL_CONFIG_FILE run $CF_TUNNEL_ID
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF
  sudo_cmd systemctl daemon-reload
  sudo_cmd systemctl enable "$TUNNEL_SERVICE_NAME" >/dev/null
  sudo_cmd systemctl restart "$TUNNEL_SERVICE_NAME"
  sudo_cmd systemctl is-active --quiet "$TUNNEL_SERVICE_NAME" || \
    die "Cloudflare Tunnel could not start; inspect: sudo journalctl -u $TUNNEL_SERVICE_NAME -n 100"
  sudo_cmd systemctl is-enabled --quiet "$TUNNEL_SERVICE_NAME" || \
    die "Cloudflare Tunnel is active but not enabled for startup."
  ok "Cloudflare Tunnel is running for https://$CF_TUNNEL_HOSTNAME"
}

disable_managed_cloudflare_tunnel_runtime() {
  local service_file
  service_file="$(managed_cloudflare_tunnel_service_file)"
  command -v systemctl >/dev/null 2>&1 || return 0
  if [ ! -f "$service_file" ]; then
    if sudo_cmd systemctl is-active --quiet "$TUNNEL_SERVICE_NAME"; then
      warn "Cloudflare Tunnel unit is active but is not at the managed unit path; leaving it untouched."
      return 1
    fi
    return 0
  fi
  if ! sudo_cmd grep -Fqx "$MANAGED_SERVICE_MARKER" "$service_file"; then
    warn "Keeping $service_file because it is not managed by this setup."
    return 1
  fi
  sudo_cmd systemctl disable --now "$TUNNEL_SERVICE_NAME" >/dev/null || \
    die "Could not disable the managed Cloudflare Tunnel service."
  if sudo_cmd systemctl is-active --quiet "$TUNNEL_SERVICE_NAME"; then
    die "Cloudflare Tunnel still reports active after it was stopped."
  fi
  if sudo_cmd systemctl is-enabled --quiet "$TUNNEL_SERVICE_NAME"; then
    die "Cloudflare Tunnel is stopped but remains enabled for startup."
  fi
}

remove_managed_cloudflare_tunnel() {
  local service_file service_home
  service_file="$(managed_cloudflare_tunnel_service_file)"

  if [ -f "$service_file" ] && sudo_cmd grep -Fqx "$MANAGED_SERVICE_MARKER" "$service_file"; then
    info "Stopping and removing managed $TUNNEL_SERVICE_NAME systemd service..."
    command -v systemctl >/dev/null 2>&1 && sudo_cmd systemctl disable --now "$TUNNEL_SERVICE_NAME" >/dev/null 2>&1 || true
    sudo_cmd rm -f "$service_file"
  fi
  if [ -d "$CF_TUNNEL_DIR" ]; then
    sudo_cmd rm -rf -- "$CF_TUNNEL_DIR"
  fi
  if cloudflare_tunnel_profile_is_saved; then
    service_home="$(cloudflare_service_user_home "$CF_TUNNEL_SERVICE_USER")"
    if [ "$CF_TUNNEL_CREDENTIALS_FILE" = "$service_home/.cloudflared/$CF_TUNNEL_ID.json" ]; then
      sudo_cmd rm -f -- "$CF_TUNNEL_CREDENTIALS_FILE"
    else
      warn "Keeping an unexpected Cloudflare credentials path: $CF_TUNNEL_CREDENTIALS_FILE"
    fi
  fi
  sudo_cmd rm -f "$CF_TUNNEL_SETTINGS_FILE"
  if command -v systemctl >/dev/null 2>&1; then
    sudo_cmd systemctl daemon-reload
  fi
  warn "The remote Cloudflare Tunnel and DNS record are kept in your Cloudflare account; delete them in the Cloudflare dashboard if they are no longer needed."
}

configure_optional_cloudflare_tunnel() {
  local mode="${1:-initial}" configure_tunnel service_user service_home hostname tunnel_name
  local existing_profile=false previous_hostname=""

  header "Optional Cloudflare Tunnel"
  if cloudflare_tunnel_profile_is_saved; then
    existing_profile=true
    previous_hostname="$CF_TUNNEL_HOSTNAME"
    if cloudflare_tunnel_is_enabled; then
      ok "A saved Cloudflare Tunnel is enabled for https://$CF_TUNNEL_HOSTNAME"
    else
      warn "A saved Cloudflare Tunnel exists but is currently OFF."
    fi
    if [ "$mode" != "replace" ]; then
      info "Choose menu option 8 to turn it on/off or replace its hostname."
      return 0
    fi
    info "The existing tunnel will be kept; enter a new hostname to route it through the same tunnel."
    warn "Any older Cloudflare CNAME is kept; remove it manually from Cloudflare DNS if it is no longer needed."
  else
    if [ "$mode" = "replace" ]; then
      info "No saved Cloudflare Tunnel exists yet; the details below will create one."
    else
      read_tty "Set up a Cloudflare Tunnel for public Lavalink access? [y/N]: "
      configure_tunnel="${REPLY:-N}"
      case "$configure_tunnel" in
        y|Y|yes|YES) ;;
        n|N|no|NO|'')
          state_set "CLOUDFLARE_TUNNEL_ENABLED" "false"
          info "No Cloudflare Tunnel will be used."
          return 0
          ;;
        *) warn "Please answer y or n."; return 0 ;;
      esac
    fi
  fi

  assert_manageable_cloudflare_tunnel_service
  ensure_cloudflared
  if [ "$existing_profile" = true ]; then
    service_user="$CF_TUNNEL_SERVICE_USER"
  else
    service_user="$(installation_service_user)"
  fi
  service_home="$(cloudflare_service_user_home "$service_user")"
  ensure_cloudflare_login "$service_user" "$service_home"

  info "The domain must already be an active Cloudflare zone. This setup creates its CNAME automatically; do not create a competing DNS record."
  read_tty "Public Lavalink hostname (for example lavalink.example.com): "
  [ -n "$REPLY" ] || { warn "Cloudflare Tunnel setup cancelled; hostname is required."; return 0; }
  hostname="$(normalise_cloudflare_hostname "$REPLY")"

  if [ "$existing_profile" = true ]; then
    CF_TUNNEL_HOSTNAME="$hostname"
  else
    tunnel_name="$(cloudflare_tunnel_name_for_hostname "$hostname")"
    create_cloudflare_tunnel "$service_user" "$service_home" "$tunnel_name" || return 0
    CF_TUNNEL_HOSTNAME="$hostname"
    save_cloudflare_tunnel_settings
  fi

  if ! route_cloudflare_hostname; then
    if [ "$existing_profile" = true ]; then
      CF_TUNNEL_HOSTNAME="$previous_hostname"
      warn "The saved tunnel hostname was not changed. Fix the DNS/zone issue, then choose menu option 8 and 'replace' again."
    else
      state_set "CLOUDFLARE_TUNNEL_ENABLED" "false"
      warn "The new tunnel profile was kept but left OFF. Use menu option 8 and 'replace' after fixing the DNS/zone issue."
    fi
    return 0
  fi
  save_cloudflare_tunnel_settings
  ensure_cloudflare_tunnel_runtime
  ok "Use this Lavalink node in the bot: host $CF_TUNNEL_HOSTNAME, port 443, secure true."
  warn "Cloudflare Tunnel only needs outbound connectivity. After testing, close inbound TCP $(configured_lavalink_port) in your VPS firewall/provider if it is still open."
}

manage_saved_cloudflare_tunnel() {
  local action

  header "Manage Cloudflare Tunnel"
  if cloudflare_tunnel_profile_is_saved; then
    show_cloudflare_tunnel_menu_status
  else
    warn "No Cloudflare Tunnel is saved yet. Choose option 3 to create one."
  fi

  echo "1) Turn Cloudflare Tunnel ON"
  echo "2) Turn Cloudflare Tunnel OFF"
  echo "3) Replace public hostname"
  echo "0) Back"
  read_tty "Choose [0]: "
  action="${REPLY:-}"
  case "$action" in
    1)
      if ! cloudflare_tunnel_profile_is_saved; then
        warn "No saved Cloudflare Tunnel exists. Choose option 3 to create one first."
        return
      fi
      assert_manageable_cloudflare_tunnel_service
      state_set "CLOUDFLARE_TUNNEL_ENABLED" "true"
      ensure_cloudflare_tunnel_runtime
      sudo_cmd systemctl is-active --quiet "$TUNNEL_SERVICE_NAME" || die "Cloudflare Tunnel did not become active."
      ok "Cloudflare Tunnel is ON and its systemd service is active."
      ;;
    2)
      if ! cloudflare_tunnel_profile_is_saved; then
        warn "No saved Cloudflare Tunnel exists to turn off."
        return
      fi
      assert_manageable_cloudflare_tunnel_service
      state_set "CLOUDFLARE_TUNNEL_ENABLED" "false"
      if disable_managed_cloudflare_tunnel_runtime; then
        ok "Cloudflare Tunnel is OFF; its hostname and credentials remain saved."
      else
        warn "The saved state is OFF, but an unmanaged tunnel service was left untouched; see the runtime status above."
      fi
      ;;
    3)
      assert_manageable_cloudflare_tunnel_service
      configure_optional_cloudflare_tunnel replace
      ;;
    0|'') info "Cloudflare Tunnel settings unchanged." ;;
    *) warn "Please choose a number from 0 to 3." ;;
  esac
}

installation_service_user() {
  local service_user
  service_user="$(stat -c '%U' "$SCRIPT_DIR" 2>/dev/null || printf '%s' "${SUDO_USER:-$USER}")"
  id -u "$service_user" >/dev/null 2>&1 || service_user="${SUDO_USER:-$USER}"
  printf '%s' "$service_user"
}

escape_redsocks_value() {
  printf '%s' "$1" | sed -e 's/[\\"]/\\&/g'
}

record_proxy_installation() {
  local created_packages_file="$1" package
  while IFS= read -r package; do
    [ -n "$package" ] && state_append_unique "PROXY_CREATED_PACKAGE" "$package"
  done < "$created_packages_file"
}

install_redsocks_without_starting_default_service() {
  local policy_file="/usr/sbin/policy-rc.d" temporary_policy created_policy=false install_status=0

  # Ubuntu/Debian's redsocks package tries to start its generic service during
  # installation. That service uses its distro config/port, which is unrelated
  # to this setup and can fail because another local proxy already owns it.
  # A temporary policy hook prevents only package-managed service starts.
  if [ ! -e "$policy_file" ]; then
    temporary_policy="$(mktemp)"
    printf '%s\n' '#!/bin/sh' 'exit 101' > "$temporary_policy"
    sudo_cmd install -o root -g root -m 755 "$temporary_policy" "$policy_file"
    rm -f "$temporary_policy"
    created_policy=true
  fi

  sudo_cmd apt-get install -y redsocks || install_status=$?

  if [ "$created_policy" = true ]; then
    sudo_cmd rm -f "$policy_file"
  fi
  [ "$install_status" -eq 0 ] || die "redsocks could not be installed."

  # Only this newly-installed package service is disabled. Existing redsocks
  # installations are left alone because they may belong to another service.
  if command -v systemctl >/dev/null 2>&1; then
    sudo_cmd systemctl disable --now redsocks.service >/dev/null 2>&1 || true
    sudo_cmd systemctl reset-failed redsocks.service >/dev/null 2>&1 || true
  fi
}

ensure_redsocks_service_user() {
  if id -u "$REDSOCKS_SERVICE_USER" >/dev/null 2>&1; then
    return
  fi

  sudo_cmd useradd --system --user-group --no-create-home --shell /usr/sbin/nologin "$REDSOCKS_SERVICE_USER"
  state_set "PROXY_CREATED_SYSTEM_USER" "true"
}

is_managed_redsocks_config() {
  local config_file="/etc/redsocks-lavalink.conf" service_file="/etc/systemd/system/redsocks-lavalink.service"
  local rules_helper="/usr/local/sbin/lavalink-egress-rules"

  [ -e "$config_file" ] || return 0
  if [ -f "$PROXY_CONFIG_MARKER_FILE" ] && sudo_cmd grep -Fqx "$MANAGED_SERVICE_MARKER" "$PROXY_CONFIG_MARKER_FILE"; then
    return 0
  fi
  # Earlier script revisions wrote the marker into the redsocks config itself.
  # Accept only that exact legacy signature, then replace it with the separate
  # marker file below because redsocks does not accept '#' comments.
  if sudo_cmd grep -Fq "$MANAGED_SERVICE_MARKER" "$config_file"; then
    warn "Replacing a legacy redsocks configuration created by this setup."
    return 0
  fi
  # A previous manual repair may have removed the invalid marker from the
  # config. The dedicated unit/helper marker still proves this config belongs
  # to this setup and may be migrated safely.
  if { [ -f "$service_file" ] && sudo_cmd grep -Fqx "$MANAGED_SERVICE_MARKER" "$service_file"; } \
    || { [ -f "$rules_helper" ] && sudo_cmd grep -Fqx "$MANAGED_SERVICE_MARKER" "$rules_helper"; }; then
    warn "Migrating an orphaned redsocks configuration owned by this setup."
    return 0
  fi
  # Last recovery path: the setup's private proxy URI still exists and the
  # config has the exact local-redirection shape this script generates. This
  # covers a manually removed unit/helper without taking ownership of an
  # arbitrary proxy config.
  if [ -f "$PROXY_SETTINGS_FILE" ] \
    && grep -Eq '^PROXY_URI=(socks5h?|http)://' "$PROXY_SETTINGS_FILE" \
    && sudo_cmd grep -Eq '^[[:space:]]*redirector[[:space:]]*=[[:space:]]*iptables;' "$config_file" \
    && sudo_cmd grep -Eq '^[[:space:]]*local_ip[[:space:]]*=[[:space:]]*127\.0\.0\.1;' "$config_file" \
    && sudo_cmd grep -Eq '^[[:space:]]*type[[:space:]]*=[[:space:]]*(socks5|http-connect);' "$config_file"; then
    warn "Migrating a recognizable redsocks configuration paired with this setup's saved proxy."
    return 0
  fi
  return 1
}

stop_managed_proxy_runtime() {
  command -v systemctl >/dev/null 2>&1 || return
  sudo_cmd systemctl stop lavalink-egress-rules.service >/dev/null 2>&1 || true
  sudo_cmd systemctl stop redsocks-lavalink.service >/dev/null 2>&1 || true
}

disable_managed_proxy_runtime() {
  local helper_file="/usr/local/sbin/lavalink-egress-rules" unit
  local -a proxy_units=("lavalink-egress-rules.service" "redsocks-lavalink.service")

  # Keep the saved URI and generated files intact. This only removes the
  # running TCP redirection so a later ON can reuse the same proxy profile.
  if [ -f "$helper_file" ] && sudo_cmd grep -Fqx "$MANAGED_SERVICE_MARKER" "$helper_file"; then
    sudo_cmd "$helper_file" remove >/dev/null 2>&1 || true
  fi
  if command -v systemctl >/dev/null 2>&1; then
    for unit in "${proxy_units[@]}"; do
      if [ -f "/etc/systemd/system/$unit" ] \
        && sudo_cmd grep -Fqx "$MANAGED_SERVICE_MARKER" "/etc/systemd/system/$unit"; then
        sudo_cmd systemctl disable --now "$unit" >/dev/null 2>&1 || true
      fi
    done
  fi
}

proxy_runtime_services_are_active() {
  local unit
  command -v systemctl >/dev/null 2>&1 || return 1
  for unit in redsocks-lavalink.service lavalink-egress-rules.service; do
    sudo_cmd systemctl is-active --quiet "$unit" || return 1
  done
  return 0
}

proxy_any_runtime_service_is_active() {
  local unit
  command -v systemctl >/dev/null 2>&1 || return 1
  for unit in redsocks-lavalink.service lavalink-egress-rules.service; do
    if sudo_cmd systemctl is-active --quiet "$unit"; then
      return 0
    fi
  done
  return 1
}

proxy_redirection_rule_is_active() {
  local helper_file="/usr/local/sbin/lavalink-egress-rules" owner redirect_port

  [ -f "$helper_file" ] || return 1
  sudo_cmd grep -Fqx "$MANAGED_SERVICE_MARKER" "$helper_file" || return 1
  owner="$(sudo_cmd awk -F'"' '/^LAVALINK_USER=/ { print $2; exit }' "$helper_file")"
  redirect_port="$(sudo_cmd awk -F= '/^REDIRECT_PORT=/ { print $2; exit }' "$helper_file")"
  [ -n "$owner" ] && [[ "$redirect_port" =~ ^[0-9]+$ ]] || return 1
  command -v iptables >/dev/null 2>&1 || return 1
  sudo_cmd iptables -w -t nat -C OUTPUT -p tcp -m owner --uid-owner "$owner" -j REDIRECT --to-ports "$redirect_port" >/dev/null 2>&1
}

verify_proxy_runtime_is_off() {
  local unit

  if proxy_redirection_rule_is_active; then
    die "Proxy routing is still active in iptables after turning it OFF. Inspect: sudo iptables -t nat -S OUTPUT"
  fi
  if proxy_any_runtime_service_is_active; then
    die "A managed proxy service is still active after turning the proxy OFF. Inspect: sudo systemctl status redsocks-lavalink lavalink-egress-rules"
  fi
  if command -v systemctl >/dev/null 2>&1; then
    for unit in redsocks-lavalink.service lavalink-egress-rules.service; do
      if [ -f "/etc/systemd/system/$unit" ] \
        && sudo_cmd grep -Fqx "$MANAGED_SERVICE_MARKER" "/etc/systemd/system/$unit" \
        && sudo_cmd systemctl is-enabled --quiet "$unit"; then
        die "Managed proxy unit $unit remains enabled after turning the proxy OFF."
      fi
    done
  fi
}

select_free_redsocks_port() {
  local candidate

  command -v ss >/dev/null 2>&1 || die "The 'ss' command is required to choose a safe local redsocks port."
  for candidate in 12346 12347 12348 12349 12350; do
    if ! ss -ltnH "sport = :$candidate" 2>/dev/null | grep -q .; then
      REDSOCKS_LOCAL_PORT="$candidate"
      ok "Using free local redsocks port: 127.0.0.1:$REDSOCKS_LOCAL_PORT"
      return
    fi
  done
  die "Ports 12346 through 12350 are already in use. Stop the conflicting local service or free one of those ports."
}

write_validated_redsocks_config() {
  local redsocks_bin="$1" escaped_host="$2" escaped_username="$3" escaped_password="$4"
  local proxy_auth_lines temporary_config

  proxy_auth_lines=""
  if [ -n "$PROXY_USERNAME" ]; then
    proxy_auth_lines=$'  login = "'"$escaped_username"$'";\n  password = "'"$escaped_password"$'";'
  fi

  temporary_config="$(mktemp)"
  (
    umask 077
    {
      printf '%s\n' 'base {'
      printf '%s\n' '  log_debug = off;'
      printf '%s\n' '  log_info = on;'
      printf '%s\n' '  daemon = off;'
      printf '%s\n' '  redirector = iptables;'
      printf '%s\n\n' '}'
      printf '%s\n' 'redsocks {'
      printf '%s\n' '  local_ip = 127.0.0.1;'
      printf '  local_port = %s;\n' "$REDSOCKS_LOCAL_PORT"
      printf '  ip = "%s";\n' "$escaped_host"
      printf '  port = %s;\n' "$PROXY_PORT"
      printf '  type = %s;\n' "$PROXY_REDSOCKS_TYPE"
      [ -z "$proxy_auth_lines" ] || printf '%s\n' "$proxy_auth_lines"
      printf '%s\n' '}'
    } > "$temporary_config"
  )

  if ! sudo_cmd "$redsocks_bin" -t -c "$temporary_config"; then
    rm -f "$temporary_config"
    die "Generated redsocks configuration failed syntax validation; no proxy service was started."
  fi
  sudo_cmd install -o root -g "$REDSOCKS_SERVICE_USER" -m 640 "$temporary_config" /etc/redsocks-lavalink.conf
  rm -f "$temporary_config"
  sudo_cmd tee "$PROXY_CONFIG_MARKER_FILE" >/dev/null <<EOF
$MANAGED_SERVICE_MARKER
EOF
  sudo_cmd chmod 600 "$PROXY_CONFIG_MARKER_FILE"
}

ensure_proxy_runtime() {
  local service_user="$1" before_packages after_packages created_packages redsocks_bin proxy_ipv4
  local escaped_host escaped_username escaped_password managed_file

  proxy_is_enabled || return 0
  command -v iptables >/dev/null 2>&1 || die "iptables is required for transparent proxy routing."
  ensure_redsocks_service_user

  if ! command -v redsocks >/dev/null 2>&1; then
    command -v apt-get >/dev/null 2>&1 || die "redsocks must be installed manually on this operating system."
    info "Installing redsocks for the optional proxy..."
    before_packages="$(mktemp)"
    after_packages="$(mktemp)"
    created_packages="$(mktemp)"
    list_installed_packages > "$before_packages"
    sudo_cmd apt-get update
    install_redsocks_without_starting_default_service
    list_installed_packages > "$after_packages"
    comm -13 "$before_packages" "$after_packages" > "$created_packages"
    record_proxy_installation "$created_packages"
    rm -f "$before_packages" "$after_packages" "$created_packages"
  fi

  redsocks_bin="$(command -v redsocks)"
  proxy_ipv4="$(getent ahostsv4 "$PROXY_HOST" 2>/dev/null | awk 'NR == 1 { print $1 }')"
  [[ "$proxy_ipv4" =~ ^([0-9]{1,3}\.){3}[0-9]{1,3}$ ]] || \
    die "Could not resolve the proxy host to an IPv4 address for redsocks: $PROXY_HOST"
  escaped_host="$(escape_redsocks_value "$proxy_ipv4")"
  escaped_username="$(escape_redsocks_value "$PROXY_USERNAME")"
  escaped_password="$(escape_redsocks_value "$PROXY_PASSWORD")"

  for managed_file in /etc/systemd/system/redsocks-lavalink.service /etc/systemd/system/lavalink-egress-rules.service /usr/local/sbin/lavalink-egress-rules; do
    if [ -f "$managed_file" ] && ! sudo_cmd grep -Fqx "$MANAGED_SERVICE_MARKER" "$managed_file"; then
      die "Refusing to overwrite unmanaged proxy file: $managed_file"
    fi
  done
  is_managed_redsocks_config || die "Refusing to overwrite unmanaged proxy file: /etc/redsocks-lavalink.conf"
  stop_managed_proxy_runtime
  select_free_redsocks_port
  write_validated_redsocks_config "$redsocks_bin" "$escaped_host" "$escaped_username" "$escaped_password"

  sudo_cmd tee /usr/local/sbin/lavalink-egress-rules >/dev/null <<EOF
#!/usr/bin/env bash
$MANAGED_SERVICE_MARKER
set -Eeuo pipefail

ACTION="\${1:-}"
LAVALINK_USER="$service_user"
REDIRECT_PORT=$REDSOCKS_LOCAL_PORT

rule() {
  iptables -w -t nat "\$@"
}

add_rule() {
  if ! rule -C OUTPUT -p tcp -m owner --uid-owner "\$LAVALINK_USER" -j REDIRECT --to-ports "\$REDIRECT_PORT" 2>/dev/null; then
    rule -A OUTPUT -p tcp -m owner --uid-owner "\$LAVALINK_USER" -d 0.0.0.0/8 -j RETURN
    rule -A OUTPUT -p tcp -m owner --uid-owner "\$LAVALINK_USER" -d 10.0.0.0/8 -j RETURN
    rule -A OUTPUT -p tcp -m owner --uid-owner "\$LAVALINK_USER" -d 127.0.0.0/8 -j RETURN
    rule -A OUTPUT -p tcp -m owner --uid-owner "\$LAVALINK_USER" -d 169.254.0.0/16 -j RETURN
    rule -A OUTPUT -p tcp -m owner --uid-owner "\$LAVALINK_USER" -d 172.16.0.0/12 -j RETURN
    rule -A OUTPUT -p tcp -m owner --uid-owner "\$LAVALINK_USER" -d 192.168.0.0/16 -j RETURN
    rule -A OUTPUT -p tcp -m owner --uid-owner "\$LAVALINK_USER" -d 224.0.0.0/4 -j RETURN
    rule -A OUTPUT -p tcp -m owner --uid-owner "\$LAVALINK_USER" -d 240.0.0.0/4 -j RETURN
    rule -A OUTPUT -p tcp -m owner --uid-owner "\$LAVALINK_USER" -j REDIRECT --to-ports "\$REDIRECT_PORT"
  fi
}

remove_rule() {
  while rule -D OUTPUT -p tcp -m owner --uid-owner "\$LAVALINK_USER" -j REDIRECT --to-ports "\$REDIRECT_PORT" 2>/dev/null; do :; done
  for network in 0.0.0.0/8 10.0.0.0/8 127.0.0.0/8 169.254.0.0/16 172.16.0.0/12 192.168.0.0/16 224.0.0.0/4 240.0.0.0/4; do
    while rule -D OUTPUT -p tcp -m owner --uid-owner "\$LAVALINK_USER" -d "\$network" -j RETURN 2>/dev/null; do :; done
  done
}

case "\$ACTION" in
  add) add_rule ;;
  remove) remove_rule ;;
  status) rule -C OUTPUT -p tcp -m owner --uid-owner "\$LAVALINK_USER" -j REDIRECT --to-ports "\$REDIRECT_PORT" ;;
  *) echo "Usage: \$0 {add|remove|status}" >&2; exit 2 ;;
esac
EOF
  sudo_cmd chmod 700 /usr/local/sbin/lavalink-egress-rules

  sudo_cmd tee /etc/systemd/system/redsocks-lavalink.service >/dev/null <<EOF
[Unit]
Description=Redsocks bridge for Lavalink proxy egress
After=network-online.target
Wants=network-online.target

$MANAGED_SERVICE_MARKER

[Service]
Type=simple
User=$REDSOCKS_SERVICE_USER
Group=$REDSOCKS_SERVICE_USER
ExecStart=$redsocks_bin -c /etc/redsocks-lavalink.conf
Restart=on-failure
RestartSec=3

[Install]
WantedBy=multi-user.target
EOF

  sudo_cmd tee /etc/systemd/system/lavalink-egress-rules.service >/dev/null <<EOF
[Unit]
Description=Transparent TCP egress rules for Lavalink
Requires=redsocks-lavalink.service
After=redsocks-lavalink.service
Before=$SERVICE_NAME.service

$MANAGED_SERVICE_MARKER

[Service]
Type=oneshot
RemainAfterExit=yes
ExecStart=/usr/local/sbin/lavalink-egress-rules add
ExecStop=/usr/local/sbin/lavalink-egress-rules remove

[Install]
WantedBy=multi-user.target
EOF

  sudo_cmd systemctl daemon-reload
  sudo_cmd systemctl enable redsocks-lavalink.service lavalink-egress-rules.service
  sudo_cmd systemctl restart redsocks-lavalink.service
  sudo_cmd systemctl start lavalink-egress-rules.service
  sudo_cmd systemctl is-active --quiet redsocks-lavalink.service || die "redsocks could not start; inspect: sudo journalctl -u redsocks-lavalink -n 100"
  sudo_cmd systemctl is-active --quiet lavalink-egress-rules.service || die "Lavalink proxy rules could not start; inspect: sudo journalctl -u lavalink-egress-rules -n 100"
  sudo_cmd systemctl is-enabled --quiet redsocks-lavalink.service || die "redsocks is active but not enabled for startup."
  sudo_cmd systemctl is-enabled --quiet lavalink-egress-rules.service || die "Lavalink proxy rules are active but not enabled for startup."
  proxy_redirection_rule_is_active || die "The proxy services started, but the Lavalink TCP redirection rule is missing. Inspect: sudo iptables -t nat -S OUTPUT"
  verify_lavalink_proxy_egress "$service_user"
  ok "Transparent $PROXY_LABEL routing is active for TCP traffic from user $service_user; Discord UDP remains direct."
}

apply_saved_proxy_state() {
  local unit_file="/etc/systemd/system/$SERVICE_NAME.service"
  local service_user was_active=false

  if ! command -v systemctl >/dev/null 2>&1; then
    die "systemd is required to manage Lavalink proxy routing."
  fi

  if [ -f "$unit_file" ]; then
    if ! sudo_cmd grep -Fqx "$MANAGED_SERVICE_MARKER" "$unit_file"; then
      die "The Lavalink unit is not managed by this setup; proxy changes cannot be applied to it safely."
    fi
    service_user="$(sudo_cmd awk -F= '/^User=/ { print $2; exit }' "$unit_file")"
    [ -n "$service_user" ] || service_user="root"
    if sudo_cmd systemctl is-active --quiet "$SERVICE_NAME"; then
      was_active=true
    fi

    if proxy_is_enabled; then
      ensure_proxy_runtime "$service_user"
      update_lavalink_proxy_dependencies true "$unit_file"
      sudo_cmd systemctl daemon-reload
    else
      # Remove the Lavalink dependency before stopping proxy units; otherwise
      # systemd may stop the player as a dependent before we can restart it.
      update_lavalink_proxy_dependencies false "$unit_file"
      sudo_cmd systemctl daemon-reload
      disable_managed_proxy_runtime
      verify_proxy_runtime_is_off
    fi

    if [ "$was_active" = true ]; then
      sudo_cmd systemctl restart "$SERVICE_NAME"
      sudo_cmd systemctl is-active --quiet "$SERVICE_NAME" || die "Lavalink did not come back after applying the proxy setting. Inspect: sudo journalctl -u $SERVICE_NAME -n 100"
      ok "Restarted Lavalink so new connections use the updated egress path."
    else
      info "Lavalink was already stopped; its unit configuration was updated without starting it."
    fi

    if proxy_is_enabled; then
      proxy_redirection_rule_is_active || die "The proxy setting is ON but its iptables routing rule is not active."
    else
      verify_proxy_runtime_is_off
    fi
    return 0
  fi

  if sudo_cmd systemctl cat "$SERVICE_NAME" >/dev/null 2>&1; then
    die "A Lavalink systemd unit exists outside this setup directory; proxy changes cannot be applied to it safely."
  fi

  # No systemd Lavalink unit exists. Still apply/clear the per-user routing so
  # an existing foreground test keeps using the saved choice. Otherwise, do
  # not proxy the installation user's unrelated TCP traffic while Lavalink is
  # stopped; the next test/install activates the saved profile.
  if proxy_is_enabled; then
    if proxy_any_runtime_service_is_active || proxy_redirection_rule_is_active; then
      service_user="$(installation_service_user)"
      ensure_proxy_runtime "$service_user"
    else
      info "No Lavalink systemd service is installed; the saved proxy will activate on the next test or install."
    fi
  else
    disable_managed_proxy_runtime
    verify_proxy_runtime_is_off
  fi
}

assert_manageable_lavalink_unit_for_proxy() {
  local unit_file="/etc/systemd/system/$SERVICE_NAME.service"
  command -v systemctl >/dev/null 2>&1 || die "systemd is required to manage Lavalink proxy routing."
  if [ -f "$unit_file" ]; then
    sudo_cmd grep -Fqx "$MANAGED_SERVICE_MARKER" "$unit_file" || \
      die "The Lavalink service is not managed by this setup; proxy settings were not changed."
  elif sudo_cmd systemctl cat "$SERVICE_NAME" >/dev/null 2>&1; then
    die "A Lavalink service exists outside this setup directory; proxy settings were not changed."
  fi
}

run_lavalink_as_user() {
  local service_user="$1"
  shift

  if [ "$(id -un)" = "$service_user" ]; then
    "$@"
  else
    sudo_cmd runuser -u "$service_user" -- "$@"
  fi
}

verify_lavalink_proxy_egress() {
  local service_user="$1" egress_ip
  command -v curl >/dev/null 2>&1 || die "curl is required to verify Lavalink proxy egress."
  egress_ip="$(run_lavalink_as_user "$service_user" curl --noproxy '*' -4fsS --connect-timeout 10 --max-time 25 https://api.ipify.org)" || \
    die "TCP from Lavalink user $service_user cannot reach the internet through the proxy. Inspect the redsocks logs and proxy credentials."
  [[ "$egress_ip" =~ ^([0-9]{1,3}\.){3}[0-9]{1,3}$ ]] || \
    die "The Lavalink proxy egress check returned an invalid IPv4 address."
  ok "Verified TCP egress from Lavalink user $service_user: $egress_ip"
}

ensure_ytdlp_temp_dir() {
  local service_user="$1" service_group
  service_group="$(id -gn "$service_user" 2>/dev/null || printf '%s' "$service_user")"

  if [ -d "$SCRIPT_DIR/tmp" ] && [ "$(stat -c '%U' "$SCRIPT_DIR/tmp" 2>/dev/null || true)" = "$service_user" ] && [ -w "$SCRIPT_DIR/tmp" ]; then
    return
  fi

  if [ "$(id -un)" = "$service_user" ]; then
    mkdir -p "$SCRIPT_DIR/tmp"
    [ -w "$SCRIPT_DIR/tmp" ] || die "yt-dlp needs a writable temporary directory: $SCRIPT_DIR/tmp"
  else
    sudo_cmd install -d -o "$service_user" -g "$service_group" "$SCRIPT_DIR/tmp"
  fi
}

run_test() {
  local lavalink_status=0 service_user
  local -a java_command=(java)

  header "Run Lavalink test"
  check_runtime_files

  if command -v systemctl >/dev/null 2>&1 && sudo_cmd systemctl is-active --quiet "$SERVICE_NAME"; then
    warn "The lavalink systemd service is running and owns the configured port."
    info "Stop it first: sudo systemctl stop $SERVICE_NAME"
    return
  fi

  [ -f "$CONFIG_FILE" ] || die "Run configuration setup first."
  service_user="$(installation_service_user)"
  if proxy_is_enabled; then
    ensure_proxy_runtime "$service_user"
  else
    disable_managed_proxy_runtime
    verify_proxy_runtime_is_off
  fi
  if [ "$SETUP_MODE" = ytdlp ]; then
    ensure_ytdlp_temp_dir "$service_user"
    java_command+=('-Djava.net.preferIPv4Stack=true' "-Djava.io.tmpdir=$SCRIPT_DIR/tmp")
  fi
  java_command+=(-jar "$JAR_FILE")
  info "Starting Lavalink in this terminal. Press Ctrl+C to stop it and return to the menu."

  trap 'printf "\n" > "$INTERACTIVE_TTY"' INT
  run_lavalink_as_user "$service_user" "${java_command[@]}" || lavalink_status=$?
  trap - INT

  if [ "$lavalink_status" -ne 0 ] && [ "$lavalink_status" -ne 130 ]; then
    warn "Lavalink test exited with status $lavalink_status."
  fi
}

install_systemd() {
  local java_path service_user service_group systemd_dependencies java_options

  header "Install or update systemd service"
  check_runtime_files
  [ -f "$CONFIG_FILE" ] || die "Run configuration setup first."
  command -v systemctl >/dev/null 2>&1 || die "systemd is unavailable on this system."

  java_path="$(command -v java)"
  service_user="$(installation_service_user)"
  service_group="$(id -gn "$service_user" 2>/dev/null || printf '%s' "$service_user")"
  systemd_dependencies=""
  java_options=""

  if proxy_is_enabled; then
    ensure_proxy_runtime "$service_user"
    systemd_dependencies=$'Requires=redsocks-lavalink.service lavalink-egress-rules.service\nAfter=redsocks-lavalink.service lavalink-egress-rules.service'
  else
    disable_managed_proxy_runtime
    verify_proxy_runtime_is_off
  fi
  if [ "$SETUP_MODE" = ytdlp ]; then
    ensure_ytdlp_temp_dir "$service_user"
    java_options="-Djava.net.preferIPv4Stack=true -Djava.io.tmpdir=$SCRIPT_DIR/tmp "
  fi

  sudo_cmd tee "/etc/systemd/system/$SERVICE_NAME.service" >/dev/null <<EOF
[Unit]
Description=Lavalink Music Node
After=network-online.target
Wants=network-online.target
$systemd_dependencies

$MANAGED_SERVICE_MARKER

[Service]
Type=simple
User=$service_user
Group=$service_group
WorkingDirectory=$SCRIPT_DIR
ExecStart=$java_path $java_options-jar $JAR_FILE
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

  sudo_cmd systemctl daemon-reload
  sudo_cmd systemctl enable "$SERVICE_NAME"
  sudo_cmd systemctl restart "$SERVICE_NAME"
  if cloudflare_tunnel_is_enabled; then
    ensure_cloudflare_tunnel_runtime
  elif ! disable_managed_cloudflare_tunnel_runtime; then
    warn "An unmanaged Cloudflare Tunnel service remains active; it was left untouched."
  fi
  sudo_cmd systemctl status "$SERVICE_NAME" --no-pager
  follow_systemd_logs
}

update_lavalink_proxy_dependencies() {
  local enabled="$1" unit_file="$2" temporary_file

  [ -f "$unit_file" ] || die "The Lavalink systemd unit is missing: $unit_file"
  sudo_cmd grep -Fqx "$MANAGED_SERVICE_MARKER" "$unit_file" || \
    die "Refusing to modify an unmanaged Lavalink systemd unit: $unit_file"

  temporary_file="$(mktemp)"
  if ! sudo_cmd awk -v proxy_enabled="$enabled" '
    /^Requires=redsocks-lavalink\.service lavalink-egress-rules\.service$/ { next }
    /^After=redsocks-lavalink\.service lavalink-egress-rules\.service$/ { next }
    /^Wants=network-online\.target$/ {
      print
      if (proxy_enabled == "true") {
        print "Requires=redsocks-lavalink.service lavalink-egress-rules.service"
        print "After=redsocks-lavalink.service lavalink-egress-rules.service"
      }
      found_wants = 1
      next
    }
    { print }
    END { if (!found_wants) exit 3 }
  ' "$unit_file" > "$temporary_file"; then
    rm -f "$temporary_file"
    die "Could not safely update the Lavalink systemd proxy dependencies."
  fi

  sudo_cmd install -o root -g root -m 644 "$temporary_file" "$unit_file"
  rm -f "$temporary_file"
  if [ "$enabled" = true ]; then
    sudo_cmd grep -Fqx 'Requires=redsocks-lavalink.service lavalink-egress-rules.service' "$unit_file" || \
      die "The Lavalink unit was not updated to require the proxy services."
  else
    if sudo_cmd grep -Fqx 'Requires=redsocks-lavalink.service lavalink-egress-rules.service' "$unit_file"; then
      die "The Lavalink unit still requires proxy services after turning the proxy OFF."
    fi
  fi
}

require_systemd_service() {
  command -v systemctl >/dev/null 2>&1 || die "systemd is unavailable on this system."

  if ! sudo_cmd systemctl cat "$SERVICE_NAME" >/dev/null 2>&1; then
    warn "The $SERVICE_NAME systemd service is not installed yet. Choose option 1 first."
    return 1
  fi
}

follow_systemd_logs() {
  local journal_status=0

  require_systemd_service || return
  header "Lavalink systemd logs"
  info "Showing live logs. Press Ctrl+C to return to the menu."

  # Ctrl+C is for journalctl only; the setup menu must stay available.
  trap 'printf "\n" > "$INTERACTIVE_TTY"' INT
  sudo_cmd journalctl -u "$SERVICE_NAME" -n 100 -f || journal_status=$?
  trap - INT

  if [ "$journal_status" -ne 0 ] && [ "$journal_status" -ne 130 ]; then
    warn "journalctl exited with status $journal_status."
  fi
}

restart_systemd() {
  header "Restart Lavalink systemd service"
  require_systemd_service || return
  sudo_cmd systemctl restart "$SERVICE_NAME"
  sudo_cmd systemctl status "$SERVICE_NAME" --no-pager
}

stop_systemd() {
  header "Stop Lavalink systemd service"
  require_systemd_service || return
  sudo_cmd systemctl stop "$SERVICE_NAME"
  ok "Lavalink systemd service stopped"
}

remove_lavalink_runtime_files() {
  local parent_dir artifact backup

  case "$SCRIPT_DIR" in
    /|"$HOME")
      die "Refusing to remove Lavalink files from $SCRIPT_DIR. Run the setup from a dedicated Lavalink directory instead."
      ;;
  esac

  if [ "$(basename "$SCRIPT_DIR")" = "lavalink" ]; then
    parent_dir="$(dirname "$SCRIPT_DIR")"
    cd "$parent_dir"
    sudo_cmd rm -rf -- "$SCRIPT_DIR"
    return
  fi

  # The setup can also be run directly from a repository/WSL shared folder.
  # Do not erase that source tree; remove every known Lavalink runtime artifact
  # while retaining run.sh, templates, README and unrelated project files.
  warn "Keeping setup/source files in $SCRIPT_DIR; removing its Lavalink runtime files only."
  for artifact in \
    "$JAR_FILE" \
    "$CONFIG_FILE" \
    "$SCRIPT_DIR/application_server.yml" \
    "$PLUGIN_DIR" \
    "$MODE_ASSET_DIR" \
    "$SCRIPT_DIR/logs" \
    "$SETUP_STATE_FILE" \
    "$PROXY_SETTINGS_FILE"; do
    [ -e "$artifact" ] && sudo_cmd rm -rf -- "$artifact"
  done
  for artifact in "$YTDLP_FILE" "$CLOUDFLARED_FILE"; do
    [ -e "$artifact" ] && sudo_cmd rm -f -- "$artifact"
  done
  [ -d "$BIN_DIR" ] && sudo_cmd rmdir -- "$BIN_DIR" 2>/dev/null || true
  for backup in "$SCRIPT_DIR"/application.yml.*-backup-*; do
    [ -e "$backup" ] && sudo_cmd rm -f -- "$backup"
  done
}

remove_managed_systemd_service() {
  local service_file="/etc/systemd/system/$SERVICE_NAME.service"

  # A service is optional: an installation that was only test-run has no
  # unit to remove.  This must still be a successful cleanup step because
  # the script uses `set -e`.
  [ -f "$service_file" ] || return 0

  if ! sudo_cmd grep -Fqx "$MANAGED_SERVICE_MARKER" "$service_file" \
    && ! sudo_cmd grep -Fqx "WorkingDirectory=$SCRIPT_DIR" "$service_file"; then
    warn "Keeping $service_file because it is not managed by this setup directory."
    return
  fi

  info "Stopping and removing the managed $SERVICE_NAME systemd service..."
  if command -v systemctl >/dev/null 2>&1; then
    sudo_cmd systemctl disable --now "$SERVICE_NAME" >/dev/null 2>&1 || true
  fi
  sudo_cmd rm -f "$service_file"
  if command -v systemctl >/dev/null 2>&1; then
    sudo_cmd systemctl daemon-reload
  fi

  return 0
}

remove_managed_proxy() {
  local helper_file config_file legacy_config=false
  local -a proxy_units=("lavalink-egress-rules.service" "redsocks-lavalink.service")
  local unit

  helper_file="/usr/local/sbin/lavalink-egress-rules"
  config_file="/etc/redsocks-lavalink.conf"

  for unit in "${proxy_units[@]}"; do
    if [ -f "/etc/systemd/system/$unit" ] && sudo_cmd grep -Fqx "$MANAGED_SERVICE_MARKER" "/etc/systemd/system/$unit"; then
      info "Stopping and removing managed $unit..."
      command -v systemctl >/dev/null 2>&1 && sudo_cmd systemctl disable --now "$unit" >/dev/null 2>&1 || true
      sudo_cmd rm -f "/etc/systemd/system/$unit"
    fi
  done

  if [ -f "$helper_file" ] && sudo_cmd grep -Fqx "$MANAGED_SERVICE_MARKER" "$helper_file"; then
    sudo_cmd "$helper_file" remove >/dev/null 2>&1 || true
    sudo_cmd rm -f "$helper_file"
  fi
  if [ -f "$config_file" ] && sudo_cmd head -n 1 "$config_file" | grep -Fqx "$MANAGED_SERVICE_MARKER"; then
    legacy_config=true
  fi
  if [ -f "$PROXY_CONFIG_MARKER_FILE" ] && sudo_cmd grep -Fqx "$MANAGED_SERVICE_MARKER" "$PROXY_CONFIG_MARKER_FILE"; then
    sudo_cmd rm -f "$PROXY_CONFIG_MARKER_FILE"
    legacy_config=true
  fi
  if [ "$legacy_config" = true ]; then
    sudo_cmd rm -f "$config_file"
  fi
  if [ "$(state_get "PROXY_CREATED_SYSTEM_USER")" = true ] && id -u "$REDSOCKS_SERVICE_USER" >/dev/null 2>&1; then
    sudo_cmd userdel "$REDSOCKS_SERVICE_USER" 2>/dev/null || warn "Keeping proxy system user $REDSOCKS_SERVICE_USER because it could not be removed safely."
  fi
  if [ "$(state_get "PROXY_CREATED_SYSTEM_USER")" = true ] && getent group "$REDSOCKS_SERVICE_USER" >/dev/null 2>&1; then
    sudo_cmd groupdel "$REDSOCKS_SERVICE_USER" 2>/dev/null || warn "Keeping proxy system group $REDSOCKS_SERVICE_USER because it could not be removed safely."
  fi
  if command -v systemctl >/dev/null 2>&1; then
    sudo_cmd systemctl daemon-reload
  fi

  return 0
}

remove_tracked_packages() {
  local state_key="$1" description="$2" package status
  local -a packages_to_remove=()

  # The setup state is absent for older/manual installs.  There simply are
  # no script-owned packages to purge, not an uninstall error.
  [ -f "$SETUP_STATE_FILE" ] || return 0
  while IFS= read -r package; do
    [[ "$package" =~ ^[A-Za-z0-9][A-Za-z0-9+.:~-]*$ ]] || continue
    status="$(dpkg-query -W -f='${db:Status-Status}' "$package" 2>/dev/null || true)"
    [ "$status" = "installed" ] && packages_to_remove+=("$package")
  done < <(awk -F= -v key="$state_key" '$1 == key { print $2 }' "$SETUP_STATE_FILE")

  if [ "${#packages_to_remove[@]}" -eq 0 ]; then
    return
  fi

  info "Removing only $description installed by this script..."
  if ! sudo_cmd apt-get purge -y "${packages_to_remove[@]}"; then
    warn "Could not remove $description automatically; Lavalink files will still be removed."
  fi

  return 0
}

remove_tracked_java() {
  if [ ! -f "$SETUP_STATE_FILE" ]; then
    warn "Java was not recorded as installed by this script; keeping all existing Java packages."
    return
  fi
  remove_tracked_packages "JAVA_CREATED_PACKAGE" "Java packages"
}

remove_lavalink() {
  header "Remove Lavalink"
  warn "This removes Lavalink runtime files in $SCRIPT_DIR, managed systemd services, proxy routing, and local Cloudflare Tunnel credentials."
  warn "It removes only Java and redsocks packages recorded as installed by this setup script."
  warn "The remote Cloudflare Tunnel and its DNS record are not deleted automatically."
  read_tty "Remove this Lavalink setup? [y/N]: "
  case "${REPLY:-N}" in
    y|Y|yes|YES) ;;
    *)
      info "Removal cancelled."
      return
      ;;
  esac

  remove_managed_systemd_service
  remove_managed_proxy
  remove_managed_cloudflare_tunnel
  remove_tracked_packages "PROXY_CREATED_PACKAGE" "redsocks proxy packages"
  remove_tracked_java

  remove_lavalink_runtime_files
  ok "Lavalink runtime was removed."
  exit 0
}

main() {
  local choice

  require_interactive_tty
  while true; do
    header "Lavalink VPS setup"
    if ! select_setup_mode; then
      continue
    fi
    if [ "$SETUP_MANAGEMENT_ONLY" != true ]; then
      ensure_java
      download_missing_runtime
      check_template
      configure_application
      migrate_ytdlp_compatibility_config
      configure_optional_proxy
      configure_optional_cloudflare_tunnel
      restart_running_service_after_setup_change
    fi

    while true; do
      echo
      info "Current source mode: $(mode_label)"
      show_proxy_menu_status
      show_cloudflare_tunnel_menu_status
      echo "1) Install / update and start systemd service"
      echo "2) Run Lavalink test"
      echo "3) View Lavalink systemd logs"
      echo "4) Restart Lavalink systemd service"
      echo "5) Stop Lavalink systemd service"
      echo "6) Uninstall Lavalink"
      echo "7) Manage HTTP / SOCKS5 proxy (1/2/3)"
      echo "8) Manage Cloudflare Tunnel (1/2/3)"
      echo "9) Back to setup menu"
      echo "0) Exit"
      read_tty "Choose: "
      choice="$REPLY"

      case "$choice" in
        1) install_systemd ;;
        2) run_test ;;
        3) follow_systemd_logs ;;
        4) restart_systemd ;;
        5) stop_systemd ;;
        6) remove_lavalink ;;
        7) manage_saved_proxy ;;
        8) manage_saved_cloudflare_tunnel ;;
        9) break ;;
        0) exit 0 ;;
        *) warn "Please choose a number from 0 to 9." ;;
      esac
    done
  done
}

self_update_setup "$@"
main "$@"
