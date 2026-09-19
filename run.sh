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
INTERACTIVE_TTY="/dev/tty"
SETUP_STATE_FILE="$SCRIPT_DIR/.lavalink-setup-state"
PROXY_SETTINGS_FILE="$SCRIPT_DIR/.lavalink-socks5-proxy"
MANAGED_SERVICE_MARKER="# Managed by waku-musicbot Lavalink setup"
LAVALINK_RELEASE_API="https://api.github.com/repos/lavalink-devs/Lavalink/releases/latest"
YOUTUBE_RELEASE_API="https://api.github.com/repos/lavalink-devs/youtube-source/releases/latest"
YTDLP_RELEASE_URL="https://github.com/yt-dlp/yt-dlp/releases/latest/download"

SETUP_MODE="plugin"
PROXY_ENABLED=false
PROXY_URI=""
PROXY_HOST=""
PROXY_PORT=""
PROXY_USERNAME=""
PROXY_PASSWORD=""

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
    plugin) printf '%s' "youtube-source plugin (legacy mode)" ;;
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
  local selected_mode existing_mode

  header "Choose Lavalink source mode"
  echo "1) youtube-source plugin (legacy configuration)"
  echo "2) LavaSrc + yt-dlp (YouTube through yt-dlp)"
  read_tty "Choose [1]: "
  case "${REPLY:-1}" in
    1) selected_mode="plugin" ;;
    2) selected_mode="ytdlp" ;;
    *) die "Please choose 1 or 2." ;;
  esac
  set_setup_mode "$selected_mode"

  if [ -f "$CONFIG_FILE" ]; then
    existing_mode="$(detect_existing_config_mode)"
    if [ "$existing_mode" != "$SETUP_MODE" ]; then
      warn "application.yml already uses $( [ "$existing_mode" = ytdlp ] && printf 'LavaSrc + yt-dlp' || printf 'youtube-source plugin' )."
      warn "Keeping the existing configuration; remove application.yml first if you intentionally want to switch modes."
      set_setup_mode "$existing_mode"
    fi
  fi

  ok "Selected mode: $(mode_label)"
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
  local url ytdlp_url

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
      if compgen -G "$PLUGIN_DIR/youtube-plugin-*.jar" >/dev/null; then
        ok "youtube-source plugin already exists; keeping the current version"
      else
        url="$(latest_youtube_plugin_url)"
        download_file "$url" "$PLUGIN_DIR/$(basename "$url")"
      fi
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
  escaped_ytdlp_path="$(escape_sed_replacement "$YTDLP_FILE")"
  sed \
    -e "0,/^  port: [0-9][0-9]*[[:space:]]*$/s|^  port: [0-9][0-9]*[[:space:]]*$|  port: $escaped_port|" \
    -e "0,/^    password: .*[[:space:]]*$/s|^    password: .*[[:space:]]*$|    password: \"$escaped_password\"|" \
    -e "s|__YTDLP_PATH__|$escaped_ytdlp_path|g" \
    "$TEMPLATE_FILE" > "$CONFIG_FILE"

  chmod 600 "$CONFIG_FILE"
  state_set "SETUP_MODE" "$SETUP_MODE"
  ok "Created application.yml from $(basename "$TEMPLATE_FILE")"
  if [ "$SETUP_MODE" = plugin ]; then
    warn "Before starting, add your YouTube OAuth refresh token and Spotify credentials to application.yml if you use those sources."
  else
    warn "Before starting, add Spotify credentials to application.yml if you use Spotify links."
  fi
}

proxy_uri_decode() {
  local encoded="$1" decoded

  [[ "$encoded" =~ ^([^%]|%[0-9A-Fa-f]{2})*$ ]] || die "The SOCKS5 URI contains an invalid percent escape."
  printf -v decoded '%b' "${encoded//%/\\x}"
  [[ "$decoded" != *$'\n'* && "$decoded" != *$'\r'* ]] || die "The SOCKS5 URI contains an invalid line break."
  printf '%s' "$decoded"
}

parse_socks5_proxy() {
  local uri="$1" authority credentials host_port encoded_username encoded_password

  case "$uri" in
    socks5://*) authority="${uri#socks5://}" ;;
    socks5h://*) authority="${uri#socks5h://}" ;;
    *) die "Proxy must use socks5:// or socks5h://, for example socks5://user:password@host:1080." ;;
  esac
  [ -n "$authority" ] || die "The SOCKS5 proxy URI is empty."
  [[ "$authority" != *['/?#']* ]] || die "Use a SOCKS5 URI without a path, query string, or fragment."

  PROXY_USERNAME=""
  PROXY_PASSWORD=""
  if [[ "$authority" == *@* ]]; then
    credentials="${authority%@*}"
    host_port="${authority##*@}"
    [[ "$credentials" == *:* ]] || die "The SOCKS5 proxy username and password must be separated with ':'."
    encoded_username="${credentials%%:*}"
    encoded_password="${credentials#*:}"
    [ -n "$encoded_username" ] && [ -n "$encoded_password" ] || die "The SOCKS5 proxy username and password cannot be empty."
    PROXY_USERNAME="$(proxy_uri_decode "$encoded_username")"
    PROXY_PASSWORD="$(proxy_uri_decode "$encoded_password")"
  else
    host_port="$authority"
  fi

  [[ "$host_port" == *:* ]] || die "The SOCKS5 proxy URI must include host:port."
  PROXY_HOST="${host_port%:*}"
  PROXY_PORT="${host_port##*:}"
  [[ "$PROXY_HOST" =~ ^[A-Za-z0-9]([A-Za-z0-9.-]*[A-Za-z0-9])?$ ]] || die "The SOCKS5 proxy host must be an IPv4 address or hostname."
  validate_port "$PROXY_PORT" || die "Invalid SOCKS5 proxy port: $PROXY_PORT"
  [[ "$PROXY_USERNAME" != *['"\\;']* && "$PROXY_PASSWORD" != *['"\\;']* ]] || \
    die "For safety, percent-encoded proxy credentials may not decode to quote, backslash, or semicolon characters."

  PROXY_URI="$uri"
}

load_proxy_settings() {
  local stored_uri

  [ -f "$PROXY_SETTINGS_FILE" ] || return 1
  stored_uri="$(awk -F= '/^PROXY_URI=/ { print substr($0, 11); exit }' "$PROXY_SETTINGS_FILE")"
  [ -n "$stored_uri" ] || die "The saved SOCKS5 proxy configuration is invalid. Remove $PROXY_SETTINGS_FILE and run setup again."
  parse_socks5_proxy "$stored_uri"
  PROXY_ENABLED=true
}

proxy_is_configured() {
  load_proxy_settings
}

check_proxy_connection() {
  local egress_ip

  command -v curl >/dev/null 2>&1 || die "curl is required to verify a SOCKS5 proxy. Install curl, then run setup again."
  info "Checking SOCKS5 proxy connectivity..."
  egress_ip="$(curl -4fsS --proxy "$PROXY_URI" --connect-timeout 10 --max-time 25 https://api.ipify.org)" || \
    die "The SOCKS5 proxy could not reach the internet. Check its host, port, credentials, and firewall."
  [[ "$egress_ip" =~ ^[0-9A-Fa-f:.]+$ ]] || die "The SOCKS5 proxy check returned an invalid egress address."
  ok "SOCKS5 proxy check succeeded (egress IP: $egress_ip)"
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
  PROXY_ENABLED=true
}

configure_optional_proxy() {
  local configure_proxy

  header "Optional SOCKS5 proxy"
  if proxy_is_configured; then
    ok "An authenticated SOCKS5 proxy is already configured for Lavalink TCP traffic."
    read_tty "Replace the current proxy? [y/N]: "
    case "${REPLY:-N}" in
      y|Y|yes|YES) ;;
      *) return ;;
    esac
  else
    PROXY_ENABLED=false
    read_tty "Set up a transparent SOCKS5 proxy for Lavalink? [y/N]: "
    configure_proxy="${REPLY:-N}"
    case "$configure_proxy" in
      y|Y|yes|YES) ;;
      n|N|no|NO|'')
        state_set "PROXY_ENABLED" "false"
        info "No SOCKS5 proxy will be used."
        return
        ;;
      *) die "Please answer y or n." ;;
    esac
  fi

  # This is intentionally visible: it lets the operator verify the full URI
  # before the connectivity check. The saved file is still permission 600.
  read_tty "SOCKS5 proxy URI (socks5://user:password@host:port): "
  [ -n "$REPLY" ] || die "A SOCKS5 proxy URI is required when proxy setup is enabled."
  parse_socks5_proxy "$REPLY"
  check_proxy_connection
  save_proxy_settings
  ok "The SOCKS5 proxy was saved with owner-only file permissions."
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

ensure_redsocks_service_user() {
  if id -u "$REDSOCKS_SERVICE_USER" >/dev/null 2>&1; then
    return
  fi

  sudo_cmd useradd --system --user-group --no-create-home --shell /usr/sbin/nologin "$REDSOCKS_SERVICE_USER"
  state_set "PROXY_CREATED_SYSTEM_USER" "true"
}

ensure_proxy_runtime() {
  local service_user="$1" before_packages after_packages created_packages redsocks_bin proxy_ipv4
  local escaped_host escaped_username escaped_password proxy_auth_lines managed_file

  proxy_is_configured || return 0
  command -v iptables >/dev/null 2>&1 || die "iptables is required for transparent SOCKS5 proxy routing."
  ensure_redsocks_service_user

  if ! command -v redsocks >/dev/null 2>&1; then
    command -v apt-get >/dev/null 2>&1 || die "redsocks must be installed manually on this operating system."
    info "Installing redsocks for the optional SOCKS5 proxy..."
    before_packages="$(mktemp)"
    after_packages="$(mktemp)"
    created_packages="$(mktemp)"
    list_installed_packages > "$before_packages"
    sudo_cmd apt-get update
    sudo_cmd apt-get install -y redsocks
    list_installed_packages > "$after_packages"
    comm -13 "$before_packages" "$after_packages" > "$created_packages"
    record_proxy_installation "$created_packages"
    rm -f "$before_packages" "$after_packages" "$created_packages"
  fi

  redsocks_bin="$(command -v redsocks)"
  proxy_ipv4="$(getent ahostsv4 "$PROXY_HOST" 2>/dev/null | awk 'NR == 1 { print $1 }')"
  [[ "$proxy_ipv4" =~ ^([0-9]{1,3}\.){3}[0-9]{1,3}$ ]] || \
    die "Could not resolve the SOCKS5 proxy host to an IPv4 address for redsocks: $PROXY_HOST"
  escaped_host="$(escape_redsocks_value "$proxy_ipv4")"
  escaped_username="$(escape_redsocks_value "$PROXY_USERNAME")"
  escaped_password="$(escape_redsocks_value "$PROXY_PASSWORD")"
  proxy_auth_lines=""
  if [ -n "$PROXY_USERNAME" ]; then
    proxy_auth_lines=$'  login = "'"$escaped_username"$'";\n  password = "'"$escaped_password"$'";'
  fi

  for managed_file in /etc/systemd/system/redsocks-lavalink.service /etc/systemd/system/lavalink-egress-rules.service /usr/local/sbin/lavalink-egress-rules /etc/redsocks-lavalink.conf; do
    if [ -f "$managed_file" ] && ! sudo_cmd grep -Fqx "$MANAGED_SERVICE_MARKER" "$managed_file"; then
      die "Refusing to overwrite unmanaged proxy file: $managed_file"
    fi
  done
  if command -v systemctl >/dev/null 2>&1 && sudo_cmd systemctl is-active --quiet lavalink-egress-rules.service; then
    # Stop first so the previous helper removes any owner-specific rules before
    # this setup rewrites it for the current Lavalink service user.
    sudo_cmd systemctl stop lavalink-egress-rules.service
  fi

  sudo_cmd tee /etc/redsocks-lavalink.conf >/dev/null <<EOF
$MANAGED_SERVICE_MARKER
base {
  log_debug = off;
  log_info = on;
  daemon = off;
  redirector = iptables;
}

redsocks {
  local_ip = 127.0.0.1;
  local_port = $REDSOCKS_LOCAL_PORT;
  ip = "$escaped_host";
  port = $PROXY_PORT;
  type = socks5;
$proxy_auth_lines
}
EOF
  sudo_cmd chown root:"$REDSOCKS_SERVICE_USER" /etc/redsocks-lavalink.conf
  sudo_cmd chmod 640 /etc/redsocks-lavalink.conf

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
  *) echo "Usage: \$0 {add|remove}" >&2; exit 2 ;;
esac
EOF
  sudo_cmd chmod 700 /usr/local/sbin/lavalink-egress-rules

  sudo_cmd tee /etc/systemd/system/redsocks-lavalink.service >/dev/null <<EOF
[Unit]
Description=Redsocks bridge for Lavalink SOCKS5 egress
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
  ok "Transparent SOCKS5 routing is active for TCP traffic from user $service_user; Discord UDP remains direct."
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
  ensure_proxy_runtime "$service_user"
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

  if proxy_is_configured; then
    ensure_proxy_runtime "$service_user"
    systemd_dependencies=$'Requires=redsocks-lavalink.service lavalink-egress-rules.service\nAfter=redsocks-lavalink.service lavalink-egress-rules.service'
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

is_safe_removal_directory() {
  case "$SCRIPT_DIR" in
    /|"$HOME") return 1 ;;
  esac

  [ "$(basename "$SCRIPT_DIR")" = "lavalink" ]
}

remove_managed_systemd_service() {
  local service_file="/etc/systemd/system/$SERVICE_NAME.service"

  [ -f "$service_file" ] || return

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
  command -v systemctl >/dev/null 2>&1 && sudo_cmd systemctl daemon-reload
}

remove_managed_proxy() {
  local service_file helper_file config_file
  local -a proxy_units=("lavalink-egress-rules.service" "redsocks-lavalink.service")
  local unit

  service_file="/etc/systemd/system/redsocks-lavalink.service"
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
  if [ -f "$config_file" ] && sudo_cmd grep -Fqx "$MANAGED_SERVICE_MARKER" "$config_file"; then
    sudo_cmd rm -f "$config_file"
  fi
  if [ "$(state_get "PROXY_CREATED_SYSTEM_USER")" = true ] && id -u "$REDSOCKS_SERVICE_USER" >/dev/null 2>&1; then
    sudo_cmd userdel "$REDSOCKS_SERVICE_USER" 2>/dev/null || warn "Keeping proxy system user $REDSOCKS_SERVICE_USER because it could not be removed safely."
  fi
  if [ "$(state_get "PROXY_CREATED_SYSTEM_USER")" = true ] && getent group "$REDSOCKS_SERVICE_USER" >/dev/null 2>&1; then
    sudo_cmd groupdel "$REDSOCKS_SERVICE_USER" 2>/dev/null || warn "Keeping proxy system group $REDSOCKS_SERVICE_USER because it could not be removed safely."
  fi
  command -v systemctl >/dev/null 2>&1 && sudo_cmd systemctl daemon-reload
}

remove_tracked_packages() {
  local state_key="$1" description="$2" package status
  local -a packages_to_remove=()

  [ -f "$SETUP_STATE_FILE" ] || return
  while IFS= read -r package; do
    [[ "$package" =~ ^[A-Za-z0-9][A-Za-z0-9+.:~-]*$ ]] || continue
    status="$(dpkg-query -W -f='${db:Status-Status}' "$package" 2>/dev/null || true)"
    [ "$status" = "installed" ] && packages_to_remove+=("$package")
  done < <(awk -F= -v key="$state_key" '$1 == key { print $2 }' "$SETUP_STATE_FILE")

  if [ "${#packages_to_remove[@]}" -eq 0 ]; then
    return
  fi

  info "Removing only $description installed by this script..."
  sudo_cmd apt-get purge -y "${packages_to_remove[@]}"
}

remove_tracked_java() {
  if [ ! -f "$SETUP_STATE_FILE" ]; then
    warn "Java was not recorded as installed by this script; keeping all existing Java packages."
    return
  fi
  remove_tracked_packages "JAVA_CREATED_PACKAGE" "Java packages"
}

remove_lavalink() {
  local parent_dir

  header "Remove Lavalink installed by this script"
  if ! is_safe_removal_directory; then
    warn "Refusing to remove unsafe directory: $SCRIPT_DIR"
    warn "Only an installation directory named 'lavalink' can be removed."
    return
  fi

  warn "This removes $SCRIPT_DIR, its Lavalink files, managed systemd service, and managed SOCKS5 routing."
  warn "It removes only Java and redsocks packages recorded as installed by this setup script."
  read_tty "Type REMOVE to continue: "
  if [ "$REPLY" != "REMOVE" ]; then
    info "Removal cancelled."
    return
  fi

  remove_managed_systemd_service
  remove_managed_proxy
  remove_tracked_packages "PROXY_CREATED_PACKAGE" "redsocks proxy packages"
  remove_tracked_java

  parent_dir="$(dirname "$SCRIPT_DIR")"
  cd "$parent_dir"
  sudo_cmd rm -rf -- "$SCRIPT_DIR"
  ok "Lavalink setup was removed."
  exit 0
}

main() {
  require_interactive_tty
  header "Lavalink VPS setup"
  select_setup_mode
  ensure_java
  download_missing_runtime
  check_template
  configure_application
  configure_optional_proxy

  while true; do
    echo
    echo "1) Install / update and start systemd service"
    echo "2) Run Lavalink test in this terminal"
    echo "3) View Lavalink systemd logs"
    echo "4) Restart Lavalink systemd service"
    echo "5) Stop Lavalink systemd service"
    echo "6) Remove Lavalink installed by this script"
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
      0) exit 0 ;;
      *) warn "Please choose a number from 0 to 6." ;;
    esac
  done
}

main "$@"
