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
SETUP_STATE_FILE="$SCRIPT_DIR/.status-dashboard-setup-state"
MANAGED_SERVICE_MARKER="# Managed by waku-musicbot status dashboard setup"
MANAGED_NGINX_MARKER="# Managed by waku-musicbot status dashboard setup"
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

validate_domain() {
  [[ "$1" =~ ^([a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,63}$ ]]
}

dashboard_port() {
  node -e 'const c = require("./config.json"); process.stdout.write(String(c.listen?.port || ""));'
}

read_state_value() {
  local key="$1"
  [ -f "$SETUP_STATE_FILE" ] || return 0
  sed -nE "s/^${key}=([^[:space:]]+)$/\\1/p" "$SETUP_STATE_FILE" | head -n 1
}

write_setup_state() {
  local domain="$1" email="$2" temporary_file
  temporary_file="${SETUP_STATE_FILE}.tmp.$$"
  (
    umask 077
    printf 'DOMAIN=%s\nEMAIL=%s\n' "$domain" "$email" > "$temporary_file"
  )
  mv "$temporary_file" "$SETUP_STATE_FILE"
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
  local node_path user group port

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

  port="$(dashboard_port)"
  if command -v curl >/dev/null 2>&1; then
    sleep 1
    if curl -fsS --max-time 5 "http://127.0.0.1:${port}/healthz" >/dev/null; then
      ok "Dashboard health check passed"
    else
      warn "The service started but its health check did not respond yet. Choose option 3 to inspect logs."
    fi
  fi

  configure_https
}

ensure_nginx_and_certbot() {
  command -v apt-get >/dev/null 2>&1 || die "Install Nginx and Certbot manually, then run this script again."
  info "Installing or checking Nginx and Certbot..."
  sudo_cmd apt-get update
  sudo_cmd apt-get install -y nginx certbot python3-certbot-nginx
  sudo_cmd systemctl enable --now nginx
}

configure_nginx_site() {
  local domain="$1" port="$2" site_file enabled_file
  site_file="/etc/nginx/sites-available/$domain"
  enabled_file="/etc/nginx/sites-enabled/$domain"

  if [ -f "$site_file" ] && ! sudo_cmd grep -Fqx "$MANAGED_NGINX_MARKER" "$site_file"; then
    die "Refusing to overwrite existing unmanaged Nginx site: $site_file"
  fi

  # Certbot adds the HTTPS server directives to this managed file. On a later
  # script run, retain those directives and change only the dashboard target.
  if [ -f "$site_file" ] && sudo_cmd grep -qE '^[[:space:]]*ssl_certificate[[:space:]]' "$site_file"; then
    sudo_cmd sed -i -E "s|proxy_pass http://127\\.0\\.0\\.1:[0-9]+;|proxy_pass http://127.0.0.1:$port;|" "$site_file"
  else
    sudo_cmd tee "$site_file" >/dev/null <<EOF
$MANAGED_NGINX_MARKER
server {
    listen 80;
    listen [::]:80;
    server_name $domain;

    location / {
        proxy_pass http://127.0.0.1:$port;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header Connection "";
        proxy_buffering off;
        proxy_read_timeout 3600;
    }
}
EOF
  fi

  if [ ! -e "$enabled_file" ]; then
    sudo_cmd ln -s "$site_file" "$enabled_file"
  fi
  sudo_cmd nginx -t
  sudo_cmd systemctl reload nginx
}

configure_https() {
  local current_domain current_email domain email port

  header "Publish dashboard with HTTPS (optional)"
  current_domain="$(read_state_value DOMAIN)"
  current_email="$(read_state_value EMAIL)"
  if [ -n "$current_domain" ]; then
    info "Current managed domain: $current_domain"
  fi
  warn "Before continuing, create an A record for the domain pointing to this VPS public IPv4."
  warn "If the domain has an AAAA record, it must point to this VPS too or be removed."
  warn "Allow inbound TCP ports 80 and 443 in both the provider firewall and UFW, if enabled."
  read_tty "Dashboard domain${current_domain:+ [$current_domain]} (Enter to skip HTTPS): "
  domain="${REPLY:-$current_domain}"
  if [ -z "$domain" ]; then
    info "Skipping Nginx and HTTPS setup; dashboard remains available only on loopback."
    return
  fi
  validate_domain "$domain" || die "Invalid domain name: $domain"

  read_tty "Email for Let's Encrypt renewal notices${current_email:+ [$current_email]}: "
  email="${REPLY:-$current_email}"
  [[ "$email" =~ ^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$ ]] || die "A valid email address is required for Certbot."

  port="$(dashboard_port)"
  info "Configuring https://$domain to proxy to dashboard port $port..."
  ensure_nginx_and_certbot
  configure_nginx_site "$domain" "$port"
  write_setup_state "$domain" "$email"
  if sudo_cmd test -s "/etc/letsencrypt/live/$domain/fullchain.pem"; then
    ok "An existing Let's Encrypt certificate is already configured for $domain"
    return
  fi
  if ! sudo_cmd certbot --nginx -d "$domain" --redirect --non-interactive --agree-tos --email "$email"; then
    warn "Certbot could not verify $domain. The dashboard service is still running locally."
    warn "Check DNS propagation and inbound TCP ports 80/443, then choose option 1 again."
    return
  fi
  ok "Dashboard is published at https://$domain"
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

remove_managed_nginx_site() {
  local domain site_file enabled_file
  domain="$(read_state_value DOMAIN)"
  [ -n "$domain" ] || return
  validate_domain "$domain" || return
  site_file="/etc/nginx/sites-available/$domain"
  enabled_file="/etc/nginx/sites-enabled/$domain"

  [ -f "$site_file" ] || return
  if ! sudo_cmd grep -Fqx "$MANAGED_NGINX_MARKER" "$site_file"; then
    warn "Keeping $site_file because it was not created by this script."
    return
  fi

  info "Removing the managed Nginx site for $domain..."
  sudo_cmd rm -f "$enabled_file" "$site_file"
  if sudo_cmd nginx -t; then
    sudo_cmd systemctl reload nginx
  else
    warn "Nginx configuration test failed after removing the site; Nginx was not reloaded."
  fi
}

uninstall_dashboard() {
  header "Uninstall status dashboard"
  warn "This removes the dashboard service, managed Nginx site, private config.json and local dashboard data."
  warn "Lavalink, its plugins, Cloudflare Tunnel, Node.js, Nginx, and existing certificates are kept untouched."
  read_tty "Type REMOVE to continue: "
  if [ "$REPLY" != "REMOVE" ]; then
    info "Removal cancelled."
    return
  fi

  remove_managed_service
  remove_managed_nginx_site
  rm -f -- "$CONFIG_FILE"
  rm -rf -- "$DATA_DIR"
  rm -f -- "$SETUP_STATE_FILE"
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
    echo "1) Install / update service and optionally publish HTTPS"
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
