#!/usr/bin/env bash
# Minimal Lavalink setup helper for Debian/Ubuntu VPSes.
# It intentionally installs only Java. Put Lavalink.jar and required local
# plugin JARs (notably youtube-source) beside this script before running it.

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

header() {
  echo -e "${CYAN}===================================================${NC}"
  echo -e "${GREEN}$1${NC}"
  echo -e "${CYAN}===================================================${NC}"
}

info() { echo -e "${CYAN}• $*${NC}"; }
ok() { echo -e "${GREEN}✓ $*${NC}"; }
warn() { echo -e "${YELLOW}! $*${NC}"; }
die() { echo -e "${RED}✗ $*${NC}" >&2; exit 1; }

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

  if ! compgen -G "$SCRIPT_DIR/plugins/youtube-plugin-*.jar" >/dev/null; then
    warn "No local youtube-source JAR found in plugins/. YouTube will not work until it is added."
  fi
}

configure_application() {
  local port password escaped_port escaped_password backup_file

  header "Configure application.yml"
  read -r -p "Lavalink port [3333]: " port
  port="${port:-3333}"
  validate_port "$port" || die "Invalid port: $port"

  while :; do
    read -r -s -p "Lavalink password: " password
    echo
    [ -n "$password" ] && break
    warn "Password cannot be blank."
  done

  if [ -f "$CONFIG_FILE" ]; then
    backup_file="$CONFIG_FILE.bak.$(date +%Y%m%d-%H%M%S)"
    cp "$CONFIG_FILE" "$backup_file"
    info "Backed up the previous config to $(basename "$backup_file")"
  fi

  escaped_port="$(escape_sed_replacement "$port")"
  escaped_password="$(escape_sed_replacement "$password")"
  sed \
    -e "0,/^  port: 3333$/s|^  port: 3333$|  port: $escaped_port|" \
    -e "0,/^    password: \"replace-with-a-long-lavalink-password\"$/s|^    password: \"replace-with-a-long-lavalink-password\"$|    password: \"$escaped_password\"|" \
    "$TEMPLATE_FILE" > "$CONFIG_FILE"

  chmod 600 "$CONFIG_FILE"
  ok "Created application.yml from example.application.yml"
  warn "Before starting, add your YouTube OAuth refresh token and Spotify credentials to application.yml if you use those sources."
}

run_test() {
  header "Run Lavalink test"
  check_runtime_files

  if command -v systemctl >/dev/null 2>&1 && sudo_cmd systemctl is-active --quiet "$SERVICE_NAME"; then
    warn "The lavalink systemd service is running and owns the configured port."
    info "Stop it first: sudo systemctl stop $SERVICE_NAME"
    return
  fi

  [ -f "$CONFIG_FILE" ] || die "Run configuration setup first."
  info "Starting Lavalink in this terminal. Press Ctrl+C to stop it."
  java -jar "$JAR_FILE"
}

install_systemd() {
  local java_path service_user service_group

  header "Install or update systemd service"
  check_runtime_files
  [ -f "$CONFIG_FILE" ] || die "Run configuration setup first."
  command -v systemctl >/dev/null 2>&1 || die "systemd is unavailable on this system."

  java_path="$(command -v java)"
  service_user="${SUDO_USER:-$USER}"
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
  sudo_cmd systemctl enable --now "$SERVICE_NAME"
  sudo_cmd systemctl restart "$SERVICE_NAME"
  sudo_cmd systemctl status "$SERVICE_NAME" --no-pager
}

main() {
  header "Lavalink VPS setup"
  ensure_java
  check_template
  configure_application

  while true; do
    echo
    echo "1) Run Lavalink test in this terminal"
    echo "2) Install / update and start systemd service"
    echo "0) Exit"
    read -r -p "Choose: " choice

    case "$choice" in
      1) run_test ;;
      2) install_systemd ;;
      0) exit 0 ;;
      *) warn "Please choose 1, 2, or 0." ;;
    esac
  done
}

main "$@"
