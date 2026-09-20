#!/usr/bin/env bash
# Create and manage a small authenticated SOCKS5 proxy for Lavalink egress.
# Debian/Ubuntu only. This script intentionally owns its own danted config and
# systemd unit, and never overwrites a generic/manual Dante installation.

set -Eeuo pipefail

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
NC='\033[0m'

SERVICE_NAME="lavalink-socks5"
CONFIG_FILE="/etc/lavalink-socks5.conf"
STATE_FILE="/etc/lavalink-socks5.state"
SERVICE_FILE="/etc/systemd/system/$SERVICE_NAME.service"
MANAGED_MARKER="# Managed by waku-musicbot Lavalink SOCKS5 setup"
INTERACTIVE_TTY="/dev/tty"

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

state_get() {
  local key="$1"
  [ -f "$STATE_FILE" ] || return 0
  sudo_cmd awk -F= -v key="$key" '$1 == key { value = substr($0, length(key) + 2) } END { if (value != "") print value }' "$STATE_FILE"
}

write_state() {
  local port="$1" username="$2" source_cidr="$3" public_address="$4" interface="$5" temporary_file
  temporary_file="$(mktemp)"
  {
    printf '%s\n' "$MANAGED_MARKER"
    printf 'PORT=%s\n' "$port"
    printf 'USERNAME=%s\n' "$username"
    printf 'SOURCE_CIDR=%s\n' "$source_cidr"
    printf 'PUBLIC_ADDRESS=%s\n' "$public_address"
    printf 'INTERFACE=%s\n' "$interface"
    printf 'ACCOUNT_CREATED=true\n'
    [ "$(state_get "DANTE_PACKAGE_CREATED")" = true ] && printf 'DANTE_PACKAGE_CREATED=true\n'
  } > "$temporary_file"
  sudo_cmd install -o root -g root -m 600 "$temporary_file" "$STATE_FILE"
  rm -f "$temporary_file"
}

set_state_flag() {
  local key="$1" value="$2" temporary_file
  temporary_file="$(mktemp)"
  {
    if [ -f "$STATE_FILE" ]; then
      sudo_cmd cat "$STATE_FILE" | grep -v -F -- "${key}=" || true
    fi
    printf '%s=%s\n' "$key" "$value"
  } > "$temporary_file"
  sudo_cmd install -o root -g root -m 600 "$temporary_file" "$STATE_FILE"
  rm -f "$temporary_file"
}

validate_port() {
  [[ "$1" =~ ^[0-9]{1,5}$ ]] && (( 10#$1 >= 1 && 10#$1 <= 65535 ))
}

validate_username() {
  [[ "$1" =~ ^[a-z_][a-z0-9_-]{0,31}$ ]]
}

validate_password() {
  [[ "$1" =~ ^[A-Za-z0-9._~-]{12,128}$ ]]
}

validate_ipv4_cidr() {
  local address prefix octet
  [[ "$1" =~ ^([0-9]{1,3}\.){3}[0-9]{1,3}/([0-9]|[12][0-9]|3[0-2])$ ]] || return 1
  address="${1%/*}"
  IFS=. read -r -a octets <<< "$address"
  for octet in "${octets[@]}"; do
    (( 10#$octet <= 255 )) || return 1
  done
}

validate_public_address() {
  [[ "$1" =~ ^([0-9]{1,3}\.){3}[0-9]{1,3}$ ]] \
    || [[ "$1" =~ ^[A-Za-z0-9]([A-Za-z0-9.-]*[A-Za-z0-9])?$ ]]
}

validate_interface() {
  [[ "$1" =~ ^[A-Za-z0-9_.:-]+$ ]]
}

default_interface() {
  ip -4 route get 1.1.1.1 2>/dev/null \
    | awk '{ for (i = 1; i <= NF; i++) if ($i == "dev") { print $(i + 1); exit } }'
}

default_public_address() {
  curl -4fsS --connect-timeout 5 --max-time 10 https://api.ipify.org 2>/dev/null || true
}

generate_password() {
  od -An -N 18 -tx1 /dev/urandom | tr -d ' \n'
}

is_managed_file() {
  local file="$1"
  [ -f "$file" ] && sudo_cmd grep -Fqx "$MANAGED_MARKER" "$file"
}

is_managed_installation() {
  is_managed_file "$CONFIG_FILE" && is_managed_file "$SERVICE_FILE"
}

ensure_safe_targets() {
  if [ -e "$CONFIG_FILE" ] && ! is_managed_file "$CONFIG_FILE"; then
    die "Refusing to overwrite unmanaged file: $CONFIG_FILE"
  fi
  if [ -e "$SERVICE_FILE" ] && ! is_managed_file "$SERVICE_FILE"; then
    die "Refusing to overwrite unmanaged file: $SERVICE_FILE"
  fi
  if [ -e "$STATE_FILE" ] && ! is_managed_file "$STATE_FILE"; then
    die "Refusing to overwrite unmanaged file: $STATE_FILE"
  fi
}

install_dante() {
  local policy_file temporary_policy created_policy=false install_status=0

  if command -v danted >/dev/null 2>&1; then
    return 0
  fi
  command -v apt-get >/dev/null 2>&1 || die "Only Debian/Ubuntu with apt-get is supported by this quick setup."

  info "Installing Dante SOCKS5 server..."
  # dante-server's generic danted.service is unrelated to our dedicated unit.
  # Temporarily prevent package post-install from starting that generic service.
  policy_file="/usr/sbin/policy-rc.d"
  if [ ! -e "$policy_file" ]; then
    temporary_policy="$(mktemp)"
    printf '%s\n' '#!/bin/sh' 'exit 101' > "$temporary_policy"
    sudo_cmd install -o root -g root -m 755 "$temporary_policy" "$policy_file"
    rm -f "$temporary_policy"
    created_policy=true
  fi

  sudo_cmd apt-get update
  sudo_cmd apt-get install -y dante-server || install_status=$?

  if [ "$created_policy" = true ]; then
    sudo_cmd rm -f "$policy_file"
  fi
  [ "$install_status" -eq 0 ] || die "dante-server could not be installed."
  command -v danted >/dev/null 2>&1 || die "dante-server was installed but danted was not found."

  # The generic packaged service is not used by this script. Disable it only
  # when it is the package's unconfigured default, never when it has custom config.
  if [ -f /etc/danted.conf ] && ! sudo_cmd grep -Eq '^[[:space:]]*internal:' /etc/danted.conf; then
    sudo_cmd systemctl disable --now danted.service >/dev/null 2>&1 || true
  fi
  set_state_flag "DANTE_PACKAGE_CREATED" "true"
  ok "Dante SOCKS5 server is installed."
}

ensure_proxy_account() {
  local username="$1" password="$2" known_username

  known_username="$(state_get "USERNAME")"
  if [ -n "$known_username" ] && [ "$known_username" != "$username" ]; then
    die "This managed proxy already uses '$known_username'. Uninstall it before changing the proxy username."
  fi
  if id -u "$username" >/dev/null 2>&1; then
    [ "$known_username" = "$username" ] || die "Refusing to modify existing system user '$username'. Choose another proxy username."
  else
    sudo_cmd useradd --system --user-group --no-create-home --shell /usr/sbin/nologin "$username"
  fi
  printf '%s:%s\n' "$username" "$password" | sudo_cmd chpasswd
}

write_config() {
  local port="$1" source_cidr="$2" interface="$3" temporary_file
  temporary_file="$(mktemp)"
  cat > "$temporary_file" <<EOF
$MANAGED_MARKER
logoutput: syslog

internal: 0.0.0.0 port = $port
external: $interface

clientmethod: none
socksmethod: username
user.privileged: root
user.unprivileged: nobody
user.libwrap: nobody

# Keep local verification available even when access is limited to another VPS.
client pass {
  from: 127.0.0.1/32 to: 0.0.0.0/0
}
client pass {
  from: $source_cidr to: 0.0.0.0/0
}

# This proxy is for Lavalink's outbound web traffic only; do not expose private
# network ranges or SOCKS BIND/UDP features through it.
socks block {
  from: 0.0.0.0/0 to: 0.0.0.0/8
  log: connect error
}
socks block {
  from: 0.0.0.0/0 to: 10.0.0.0/8
  log: connect error
}
socks block {
  from: 0.0.0.0/0 to: 127.0.0.0/8
  log: connect error
}
socks block {
  from: 0.0.0.0/0 to: 169.254.0.0/16
  log: connect error
}
socks block {
  from: 0.0.0.0/0 to: 172.16.0.0/12
  log: connect error
}
socks block {
  from: 0.0.0.0/0 to: 192.168.0.0/16
  log: connect error
}
socks pass {
  from: 0.0.0.0/0 to: 0.0.0.0/0
  command: connect
  log: connect error
}
EOF
  sudo_cmd install -o root -g root -m 640 "$temporary_file" "$CONFIG_FILE"
  rm -f "$temporary_file"
}

write_service() {
  local danted_bin="$1" temporary_file
  temporary_file="$(mktemp)"
  cat > "$temporary_file" <<EOF
[Unit]
Description=Authenticated SOCKS5 proxy for Lavalink egress
After=network-online.target
Wants=network-online.target

$MANAGED_MARKER

[Service]
Type=simple
ExecStart=$danted_bin -D -f $CONFIG_FILE
ExecReload=/bin/kill -HUP \$MAINPID
Restart=on-failure
RestartSec=3

[Install]
WantedBy=multi-user.target
EOF
  sudo_cmd install -o root -g root -m 644 "$temporary_file" "$SERVICE_FILE"
  rm -f "$temporary_file"
}

configure_ufw() {
  local port="$1" answer

  command -v ufw >/dev/null 2>&1 || return 0
  sudo_cmd ufw status 2>/dev/null | grep -q '^Status: active' || return 0
  read_tty "UFW is active. Allow TCP $port for this proxy? [Y/n]: "
  answer="${REPLY:-Y}"
  case "$answer" in
    y|Y|yes|YES) sudo_cmd ufw allow "$port/tcp" ;;
    n|N|no|NO) warn "UFW rule was not added. Open TCP $port yourself before using the proxy remotely." ;;
    *) warn "UFW was left unchanged." ;;
  esac
}

start_and_verify() {
  local port="$1" username="$2" password="$3" public_address="$4" egress_ip

  sudo_cmd systemctl daemon-reload
  sudo_cmd systemctl enable "$SERVICE_NAME.service" >/dev/null
  sudo_cmd systemctl restart "$SERVICE_NAME.service"
  if ! sudo_cmd systemctl is-active --quiet "$SERVICE_NAME.service"; then
    sudo_cmd journalctl -u "$SERVICE_NAME.service" -n 80 --no-pager || true
    die "The SOCKS5 service could not start."
  fi
  if ! ss -ltnH "sport = :$port" 2>/dev/null | grep -q .; then
    die "The SOCKS5 service is active but is not listening on TCP port $port."
  fi

  egress_ip="$(curl -4fsS --proxy "socks5://$username:$password@127.0.0.1:$port" --connect-timeout 10 --max-time 25 https://api.ipify.org)" \
    || die "The SOCKS5 service started but its local authenticated connectivity test failed."
  ok "SOCKS5 test succeeded (egress IP: $egress_ip)"
  echo
  ok "SOCKS5 URI: socks5://$username:$password@$public_address:$port"
  warn "Open TCP $port in your VPS provider firewall/security group if it is not already open."
  warn "SOCKS5 username/password authentication is not encrypted on the network; use a unique password and preferably restrict Source CIDR to your Lavalink VPS IP."
}

setup_proxy() {
  local previous_port previous_username previous_source previous_public previous_interface
  local port username password generated_password source_cidr public_address interface

  header "Create or update Lavalink SOCKS5 proxy"
  ensure_safe_targets
  install_dante

  previous_port="$(state_get "PORT")"
  validate_port "$previous_port" || previous_port="18080"
  previous_username="$(state_get "USERNAME")"
  validate_username "$previous_username" || previous_username="lavalinkproxy"
  previous_source="$(state_get "SOURCE_CIDR")"
  validate_ipv4_cidr "$previous_source" || previous_source="0.0.0.0/0"
  previous_public="$(state_get "PUBLIC_ADDRESS")"
  if ! validate_public_address "$previous_public"; then
    previous_public="$(default_public_address)"
  fi
  previous_interface="$(state_get "INTERFACE")"
  if ! validate_interface "$previous_interface"; then
    previous_interface="$(default_interface)"
  fi

  read_tty "SOCKS5 port [$previous_port]: "
  port="${REPLY:-$previous_port}"
  validate_port "$port" || die "Invalid port: $port"

  read_tty "SOCKS5 username [$previous_username]: "
  username="${REPLY:-$previous_username}"
  validate_username "$username" || die "Username must use lowercase letters, numbers, _ or -, start with a letter/_ and be at most 32 characters."

  generated_password="$(generate_password)"
  if [ -n "$(state_get "USERNAME")" ]; then
    read_tty "SOCKS5 password [Enter keeps the current password]: " true
    password="${REPLY:-}"
    if [ -z "$password" ]; then
      info "Keeping the existing SOCKS5 password."
    fi
  else
    read_tty "SOCKS5 password [Enter generates a secure password]: " true
    password="${REPLY:-$generated_password}"
  fi
  [ -z "$password" ] || validate_password "$password" || \
    die "Password must be 12-128 URI-safe characters: letters, numbers, . _ ~ or -."

  read_tty "Allowed Lavalink source IPv4/CIDR [$previous_source]: "
  source_cidr="${REPLY:-$previous_source}"
  validate_ipv4_cidr "$source_cidr" || die "Use an IPv4 CIDR such as 172.104.173.165/32 or 0.0.0.0/0."

  if [ -n "$previous_public" ]; then
    read_tty "Public proxy address for the URI [$previous_public]: "
  else
    read_tty "Public proxy address for the URI: "
  fi
  public_address="${REPLY:-$previous_public}"
  validate_public_address "$public_address" || die "Enter a public IPv4 address or hostname."

  read_tty "Outbound network interface [$previous_interface]: "
  interface="${REPLY:-$previous_interface}"
  validate_interface "$interface" || die "Invalid network interface."
  ip link show "$interface" >/dev/null 2>&1 || die "Network interface '$interface' was not found."

  if [ -z "$password" ]; then
    # Passwords are deliberately never stored outside /etc/shadow. If the user
    # chose Enter during an update, no password change or URI reprint is made.
    write_config "$port" "$source_cidr" "$interface"
    write_service "$(command -v danted)"
    write_state "$port" "$username" "$source_cidr" "$public_address" "$interface"
    configure_ufw "$port"
    sudo_cmd systemctl daemon-reload
    sudo_cmd systemctl enable "$SERVICE_NAME.service" >/dev/null
    sudo_cmd systemctl restart "$SERVICE_NAME.service"
    sudo_cmd systemctl is-active --quiet "$SERVICE_NAME.service" || die "The SOCKS5 service could not start."
    ok "SOCKS5 proxy was updated. Existing password was kept."
    info "Saved proxy URI: socks5://$username:<existing-password>@$public_address:$port"
    return 0
  fi

  ensure_proxy_account "$username" "$password"
  write_config "$port" "$source_cidr" "$interface"
  write_service "$(command -v danted)"
  write_state "$port" "$username" "$source_cidr" "$public_address" "$interface"
  configure_ufw "$port"
  start_and_verify "$port" "$username" "$password" "$public_address"
}

show_status() {
  local port username public_address source_cidr

  header "Lavalink SOCKS5 proxy status"
  if ! is_managed_installation; then
    warn "No proxy installation managed by this script was found."
    return 0
  fi
  port="$(state_get "PORT")"
  username="$(state_get "USERNAME")"
  public_address="$(state_get "PUBLIC_ADDRESS")"
  source_cidr="$(state_get "SOURCE_CIDR")"
  info "Service: $SERVICE_NAME"
  info "Port: $port | User: $username | Allowed source: $source_cidr"
  info "URI format: socks5://$username:<password>@$public_address:$port"
  sudo_cmd systemctl status "$SERVICE_NAME.service" --no-pager || true
}

follow_logs() {
  header "Lavalink SOCKS5 proxy logs"
  is_managed_installation || { warn "No managed SOCKS5 proxy was found."; return 0; }
  info "Press Ctrl+C to return."
  sudo_cmd journalctl -u "$SERVICE_NAME.service" -n 100 -f || true
}

restart_proxy() {
  header "Restart Lavalink SOCKS5 proxy"
  is_managed_installation || { warn "No managed SOCKS5 proxy was found."; return 0; }
  sudo_cmd systemctl restart "$SERVICE_NAME.service"
  sudo_cmd systemctl is-active --quiet "$SERVICE_NAME.service" || die "The SOCKS5 proxy did not restart."
  ok "SOCKS5 proxy restarted."
}

stop_proxy() {
  header "Stop Lavalink SOCKS5 proxy"
  is_managed_installation || { warn "No managed SOCKS5 proxy was found."; return 0; }
  sudo_cmd systemctl stop "$SERVICE_NAME.service"
  ok "SOCKS5 proxy stopped."
}

remove_proxy() {
  local username package_created

  header "Remove Lavalink SOCKS5 proxy"
  is_managed_installation || { warn "No managed SOCKS5 proxy was found."; return 0; }
  warn "This removes only $SERVICE_NAME, its config, and its dedicated proxy account."
  warn "It removes dante-server only if this script recorded installing it."
  read_tty "Remove this SOCKS5 proxy? [y/N]: "
  case "${REPLY:-N}" in
    y|Y|yes|YES) ;;
    *) info "Removal cancelled."; return 0 ;;
  esac

  username="$(state_get "USERNAME")"
  package_created="$(state_get "DANTE_PACKAGE_CREATED")"
  sudo_cmd systemctl disable --now "$SERVICE_NAME.service" >/dev/null 2>&1 || true
  sudo_cmd rm -f "$SERVICE_FILE" "$CONFIG_FILE" "$STATE_FILE"
  sudo_cmd systemctl daemon-reload
  if id -u "$username" >/dev/null 2>&1; then
    sudo_cmd userdel "$username" 2>/dev/null || warn "Keeping proxy account '$username' because it could not be removed safely."
  fi
  if [ "$package_created" = true ]; then
    info "Removing dante-server installed by this script..."
    sudo_cmd apt-get purge -y dante-server || warn "Could not purge dante-server automatically."
  fi
  ok "Lavalink SOCKS5 proxy was removed."
}

management_menu() {
  local choice

  while true; do
    echo
    echo "1) Create / update SOCKS5 proxy"
    echo "2) View proxy status"
    echo "3) View proxy logs"
    echo "4) Restart proxy"
    echo "5) Stop proxy"
    echo "6) Uninstall proxy"
    echo "0) Exit"
    read_tty "Choose: "
    choice="$REPLY"
    case "$choice" in
      1) setup_proxy ;;
      2) show_status ;;
      3) follow_logs ;;
      4) restart_proxy ;;
      5) stop_proxy ;;
      6) remove_proxy ;;
      0) exit 0 ;;
      *) warn "Please choose a number from 0 to 6." ;;
    esac
  done
}

main() {
  require_interactive_tty
  if is_managed_installation; then
    header "Lavalink SOCKS5 proxy setup"
    management_menu
  fi
  setup_proxy
}

main "$@"
