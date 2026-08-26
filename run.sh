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
TEMPLATE_FILE="$SCRIPT_DIR/example.application.yml"
CONFIG_FILE="$SCRIPT_DIR/application.yml"
JAR_FILE="$SCRIPT_DIR/Lavalink.jar"
PLUGIN_DIR="$SCRIPT_DIR/plugins"
INTERACTIVE_TTY="/dev/tty"
LAVALINK_RELEASE_API="https://api.github.com/repos/lavalink-devs/Lavalink/releases/latest"
YOUTUBE_RELEASE_API="https://api.github.com/repos/lavalink-devs/youtube-source/releases/latest"

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

ensure_java() {
  local major package_name

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

  sudo_cmd apt-get install -y "$package_name"
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
    | grep -E '/youtube-plugin-[^/]+\.jar$' \
    | grep -Ev -- '-(sources|javadoc)\.jar$' \
    | head -n 1)"
  [ -n "$url" ] || die "Could not find the latest youtube-plugin JAR."
  printf '%s\n' "$url"
}

download_missing_runtime() {
  local url

  header "Download Lavalink and plugins"
  mkdir -p "$PLUGIN_DIR"

  if [ -s "$JAR_FILE" ]; then
    ok "Lavalink.jar already exists; keeping the current version"
  else
    url="$(latest_release_asset_url "$LAVALINK_RELEASE_API" 'Lavalink\.jar')"
    download_file "$url" "$JAR_FILE"
  fi

  if compgen -G "$PLUGIN_DIR/youtube-plugin-*.jar" >/dev/null; then
    ok "youtube-source plugin already exists; keeping the current version"
  else
    url="$(latest_youtube_plugin_url)"
    download_file "$url" "$PLUGIN_DIR/$(basename "$url")"
  fi

  info "LavaSrc is declared in example.application.yml and Lavalink downloads it automatically on first start."
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

  if ! compgen -G "$PLUGIN_DIR/youtube-plugin-*.jar" >/dev/null; then
    die "Missing youtube-source plugin. Run the setup script again to download it."
  fi
}

configure_application() {
  local port password escaped_port escaped_password

  header "Configure application.yml"
  if [ -f "$CONFIG_FILE" ]; then
    ok "application.yml already exists; keeping the current configuration"
    return
  fi

  read_tty "Lavalink port [3333]: "
  port="$REPLY"
  port="${port:-3333}"
  validate_port "$port" || die "Invalid port: $port"

  read_tty "Lavalink password [takeshi.dev]: " true
  password="${REPLY:-takeshi.dev}"

  escaped_port="$(escape_sed_replacement "$port")"
  escaped_password="$(escape_sed_replacement "$password")"
  sed \
    -e "0,/^  port: [0-9][0-9]*[[:space:]]*$/s|^  port: [0-9][0-9]*[[:space:]]*$|  port: $escaped_port|" \
    -e "0,/^    password: .*[[:space:]]*$/s|^    password: .*[[:space:]]*$|    password: \"$escaped_password\"|" \
    "$TEMPLATE_FILE" > "$CONFIG_FILE"

  chmod 600 "$CONFIG_FILE"
  ok "Created application.yml from example.application.yml"
  warn "Before starting, add your YouTube OAuth refresh token and Spotify credentials to application.yml if you use those sources."
}

run_test() {
  local lavalink_status=0

  header "Run Lavalink test"
  check_runtime_files

  if command -v systemctl >/dev/null 2>&1 && sudo_cmd systemctl is-active --quiet "$SERVICE_NAME"; then
    warn "The lavalink systemd service is running and owns the configured port."
    info "Stop it first: sudo systemctl stop $SERVICE_NAME"
    return
  fi

  [ -f "$CONFIG_FILE" ] || die "Run configuration setup first."
  info "Starting Lavalink in this terminal. Press Ctrl+C to stop it and return to the menu."

  trap 'printf "\n" > "$INTERACTIVE_TTY"' INT
  java -jar "$JAR_FILE" || lavalink_status=$?
  trap - INT

  if [ "$lavalink_status" -ne 0 ] && [ "$lavalink_status" -ne 130 ]; then
    warn "Lavalink test exited with status $lavalink_status."
  fi
}

install_systemd() {
  local java_path service_user service_group

  header "Install or update systemd service"
  check_runtime_files
  [ -f "$CONFIG_FILE" ] || die "Run configuration setup first."
  command -v systemctl >/dev/null 2>&1 || die "systemd is unavailable on this system."

  java_path="$(command -v java)"
  service_user="$(stat -c '%U' "$SCRIPT_DIR" 2>/dev/null || printf '%s' "${SUDO_USER:-$USER}")"
  id -u "$service_user" >/dev/null 2>&1 || service_user="${SUDO_USER:-$USER}"
  service_group="$(id -gn "$service_user" 2>/dev/null || printf '%s' "$service_user")"

  sudo_cmd tee "/etc/systemd/system/$SERVICE_NAME.service" >/dev/null <<EOF
[Unit]
Description=Lavalink Music Node
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=$service_user
Group=$service_group
WorkingDirectory=$SCRIPT_DIR
ExecStart=$java_path -jar $JAR_FILE
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

  sudo_cmd systemctl daemon-reload
  sudo_cmd systemctl enable "$SERVICE_NAME"
  sudo_cmd systemctl restart "$SERVICE_NAME"
  sudo_cmd systemctl status "$SERVICE_NAME" --no-pager
  follow_systemd_logs
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

main() {
  require_interactive_tty
  header "Lavalink VPS setup"
  ensure_java
  download_missing_runtime
  check_template
  configure_application

  while true; do
    echo
    echo "1) Install / update and start systemd service"
    echo "2) Run Lavalink test in this terminal"
    echo "3) View Lavalink systemd logs"
    echo "4) Restart Lavalink systemd service"
    echo "5) Stop Lavalink systemd service"
    echo "0) Exit"
    read_tty "Choose: "
    choice="$REPLY"

    case "$choice" in
      1) install_systemd ;;
      2) run_test ;;
      3) follow_systemd_logs ;;
      4) restart_systemd ;;
      5) stop_systemd ;;
      0) exit 0 ;;
      *) warn "Please choose a number from 0 to 5." ;;
    esac
  done
}

main "$@"
