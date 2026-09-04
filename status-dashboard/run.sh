#!/usr/bin/env bash
# Interactive setup and lifecycle helper for the Lavalink status dashboard.
# It manages only this dashboard service. Lavalink and Cloudflare Tunnel are
# intentionally never stopped, reconfigured, or removed here.

set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

SERVICE_NAME="takeshi-lavalink-status"
SERVICE_FILE="/etc/systemd/system/${SERVICE_NAME}.service"
CONFIG_FILE="$SCRIPT_DIR/config.json"
TEMPLATE_FILE="$SCRIPT_DIR/config.example.json"
SERVER_FILE="$SCRIPT_DIR/server.js"
DATA_DIR="$SCRIPT_DIR/data"
MANAGED_SERVICE_MARKER="# Managed by waku-musicbot status dashboard setup"
INTERACTIVE_TTY="/dev/tty"

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
NC='\033[0m'

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
    IFS= read -r -s REPLY < "$INTERACTIVE_TTY" || die "Could not read input from the terminal."
    printf '\n' > "$INTERACTIVE_TTY"
  else
    IFS= read -r REPLY < "$INTERACTIVE_TTY" || die "Could not read input from the terminal."
  fi
}

sudo_cmd() {
  if [ "$EUID" -eq 0 ]; then
    "$@"
  else
    sudo "$@"
  fi
}

node_major() {
  node --version 2>/dev/null | sed -nE 's/^v([0-9]+).*/\1/p' | head -n 1
}

ensure_node() {
  local major
  if command -v node >/dev/null 2>&1; then
    major="$(node_major)"
    if [[ "$major" =~ ^[0-9]+$ ]] && (( major >= 18 )); then
      ok "Node.js $major is ready"
      return
    fi
    warn "Node.js ${major:-unknown} is too old; this dashboard requires Node.js 18 or newer."
  else
    warn "Node.js was not found."
  fi

  command -v apt-get >/dev/null 2>&1 || die "Install Node.js 18 or newer manually, then run this script again."
  info "Installing the distribution Node.js package..."
  sudo_cmd apt-get update
  sudo_cmd apt-get install -y nodejs

  major="$(node_major)"
  [[ "$major" =~ ^[0-9]+$ ]] && (( major >= 18 )) || \
    die "The installed Node.js is older than 18. Install Node.js 18+ manually, then run this script again."
  ok "Node.js $major is ready"
}

validate_port() {
  [[ "$1" =~ ^[0-9]{1,5}$ ]] && (( 10#$1 >= 1 && 10#$1 <= 65535 ))
}

check_runtime_files() {
  [ -f "$SERVER_FILE" ] || die "Missing dashboard server: $SERVER_FILE"
  [ -f "$TEMPLATE_FILE" ] || die "Missing dashboard template: $TEMPLATE_FILE"
}

configure_dashboard() {
  local node_url node_password dashboard_port

  header "Configure status dashboard"
  if [ -f "$CONFIG_FILE" ]; then
    ok "config.json already exists; keeping the current configuration"
    return
  fi

  read_tty "Primary Lavalink URL [http://127.0.0.1:3333]: "
  node_url="${REPLY:-http://127.0.0.1:3333}"
  [[ "$node_url" =~ ^https?://[^[:space:]]+$ ]] || die "The Lavalink URL must start with http:// or https://"

  read_tty "Primary Lavalink password: " true
  node_password="$REPLY"
  [ -n "$node_password" ] || die "A Lavalink password is required."

  read_tty "Dashboard loopback port [3010]: "
  dashboard_port="${REPLY:-3010}"
  validate_port "$dashboard_port" || die "Invalid port: $dashboard_port"

  NODE_URL="$node_url" NODE_PASSWORD="$node_password" DASHBOARD_PORT="$dashboard_port" \
    node -e '
      const fs = require("fs");
      const config = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
      config.listen = { ...(config.listen || {}), host: "127.0.0.1", port: Number(process.env.DASHBOARD_PORT) };
      config.nodes = [{
        id: "primary",
        name: "Lavalink",
        url: process.env.NODE_URL,
        password: process.env.NODE_PASSWORD,
        local: /^http:\/\/127\.0\.0\.1(?::|\/|$)/.test(process.env.NODE_URL)
      }];
      fs.writeFileSync(process.argv[2], JSON.stringify(config, null, 2) + "\n", { mode: 0o600 });
    ' "$TEMPLATE_FILE" "$CONFIG_FILE"

  chmod 600 "$CONFIG_FILE"
  ok "Created config.json from config.example.json"
  info "Add remote nodes later by editing $CONFIG_FILE, then choose restart."
}

service_user() {
  local owner
  owner="$(stat -c '%U' "$SCRIPT_DIR" 2>/dev/null || true)"
  if [ -n "$owner" ] && id -u "$owner" >/dev/null 2>&1; then
    printf '%s\n' "$owner"
  else
    printf '%s\n' "${SUDO_USER:-$USER}"
  fi
}

install_systemd() {
  local node_path user group

  header "Install or update dashboard service"
  check_runtime_files
  [ -f "$CONFIG_FILE" ] || die "Run configuration setup first."
  command -v systemctl >/dev/null 2>&1 || die "systemd is unavailable on this system."

  node_path="$(command -v node)"
  user="$(service_user)"
  id -u "$user" >/dev/null 2>&1 || die "The dashboard service user does not exist: $user"
  group="$(id -gn "$user")"

  sudo_cmd tee "$SERVICE_FILE" >/dev/null <<EOF
[Unit]
Description=Takeshi Lavalink Status Dashboard
After=network-online.target
Wants=network-online.target

$MANAGED_SERVICE_MARKER

[Service]
Type=simple
User=$user
Group=$group
WorkingDirectory=$SCRIPT_DIR
ExecStart=$node_path $SERVER_FILE
Restart=on-failure
RestartSec=5
NoNewPrivileges=true
PrivateTmp=true

[Install]
WantedBy=multi-user.target
EOF

  sudo_cmd systemctl daemon-reload
  sudo_cmd systemctl enable "$SERVICE_NAME"
  sudo_cmd systemctl restart "$SERVICE_NAME"
  sudo_cmd systemctl status "$SERVICE_NAME" --no-pager

  if command -v curl >/dev/null 2>&1; then
    sleep 1
    if curl -fsS --max-time 5 "http://127.0.0.1:$(node -e 'console.log(require("./config.json").listen.port)' 2>/dev/null)/healthz" >/dev/null; then
      ok "Dashboard health check passed"
    else
      warn "The service started but its health check did not respond yet. Choose option 3 to inspect logs."
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

run_test() {
  local status=0

  header "Run dashboard test"
  check_runtime_files
  [ -f "$CONFIG_FILE" ] || die "Run configuration setup first."

  if command -v systemctl >/dev/null 2>&1 && sudo_cmd systemctl is-active --quiet "$SERVICE_NAME"; then
    warn "The systemd dashboard service is already running and owns the configured port."
    info "Stop it first with option 5 if you want to test it in this terminal."
    return
  fi

  info "Starting the dashboard in this terminal. Press Ctrl+C to return to the menu."
  trap 'printf "\n" > "$INTERACTIVE_TTY"' INT
  node "$SERVER_FILE" || status=$?
  trap - INT
  if [ "$status" -ne 0 ] && [ "$status" -ne 130 ]; then
    warn "Dashboard test exited with status $status."
  fi
}

follow_systemd_logs() {
  local status=0

  require_systemd_service || return
  header "Dashboard systemd logs"
  info "Showing live logs. Press Ctrl+C to return to the menu."
  trap 'printf "\n" > "$INTERACTIVE_TTY"' INT
  sudo_cmd journalctl -u "$SERVICE_NAME" -n 100 -f || status=$?
  trap - INT
  if [ "$status" -ne 0 ] && [ "$status" -ne 130 ]; then
    warn "journalctl exited with status $status."
  fi
}

restart_systemd() {
  header "Restart dashboard service"
  require_systemd_service || return
  sudo_cmd systemctl restart "$SERVICE_NAME"
  sudo_cmd systemctl status "$SERVICE_NAME" --no-pager
}

stop_systemd() {
  header "Stop dashboard service"
  require_systemd_service || return
  sudo_cmd systemctl stop "$SERVICE_NAME"
  ok "Dashboard service stopped"
}

remove_managed_service() {
  [ -f "$SERVICE_FILE" ] || return
  if ! sudo_cmd grep -Fqx "$MANAGED_SERVICE_MARKER" "$SERVICE_FILE"; then
    warn "Keeping $SERVICE_FILE because it was not created by this script."
    return
  fi

  info "Stopping and removing the dashboard systemd service..."
  sudo_cmd systemctl disable --now "$SERVICE_NAME" >/dev/null 2>&1 || true
  sudo_cmd rm -f "$SERVICE_FILE"
  sudo_cmd systemctl daemon-reload
}

uninstall_dashboard() {
  header "Uninstall status dashboard"
  warn "This removes only the dashboard service, private config.json and local dashboard data."
  warn "Lavalink, its plugins, Cloudflare Tunnel, and Node.js are kept untouched."
  read_tty "Type REMOVE to continue: "
  if [ "$REPLY" != "REMOVE" ]; then
    info "Removal cancelled."
    return
  fi

  remove_managed_service
  rm -f -- "$CONFIG_FILE"
  rm -rf -- "$DATA_DIR"
  ok "Status dashboard setup was removed."
}

main() {
  require_interactive_tty
  header "Lavalink status dashboard setup"
  check_runtime_files
  ensure_node
  configure_dashboard

  while true; do
    echo
    echo "1) Install / update and start systemd service"
    echo "2) Run dashboard test in this terminal"
    echo "3) View dashboard systemd logs"
    echo "4) Restart dashboard systemd service"
    echo "5) Stop dashboard systemd service"
    echo "6) Uninstall dashboard setup"
    echo "0) Exit"
    read_tty "Choose: "

    case "$REPLY" in
      1) install_systemd ;;
      2) run_test ;;
      3) follow_systemd_logs ;;
      4) restart_systemd ;;
      5) stop_systemd ;;
      6) uninstall_dashboard ;;
      0) exit 0 ;;
      *) warn "Please choose a number from 0 to 6." ;;
    esac
  done
}

main "$@"
