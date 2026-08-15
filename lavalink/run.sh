#!/usr/bin/env bash
set -o pipefail
GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; CYAN='\033[0;36m'; BLUE='\033[0;34m'; NC='\033[0m'
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"; cd "$SCRIPT_DIR" || exit 1
LAVALINK_REPO="lavalink-devs/Lavalink"; YOUTUBE_REPO="lavalink-devs/youtube-source"; LAVASRC_REPO="topi314/LavaSrc"
YTCIPHER_REPO="https://github.com/kikkia/yt-cipher.git"; EJS_REPO="https://github.com/yt-dlp/ejs.git"; EJS_COMMIT="cd4e87f52e87ab6d8b318fd3a817adda6fafa8dc"
LAVA_PORT="3333"; LAVA_PASS="takeshi"; LAVA_ADDRESS="0.0.0.0"; REMOTE_CIPHER_PORT="8001"; REMOTE_CIPHER_HOST="127.0.0.1"; REMOTE_CIPHER_PASSWORD="test"; REMOTE_CIPHER_USER_AGENT="discord-musicbot-lavalink"; REMOTE_CIPHER_URL="http://localhost:8001"
ENABLE_IPV6="false"; IPV6_BLOCK=""; SPOTIFY_ID=""; SPOTIFY_SECRET=""; POT_TOKEN=""; VISITOR_DATA=""; OPEN_UFW="true"; YOUTUBE_PLUGIN_VERSION="1.18.2"; LAVASRC_PLUGIN_VERSION="4.8.3"; FAILED_STEPS=()
header(){ echo -e "${CYAN}===================================================${NC}\n${GREEN}$1${NC}\n${CYAN}===================================================${NC}"; }
ok(){ echo -e "${GREEN}OK: $1${NC}"; }; warn(){ echo -e "${YELLOW}WARN: $1${NC}"; }; err(){ echo -e "${RED}ERR: $1${NC}"; }; info(){ echo -e "${BLUE}INFO: $1${NC}"; }
sudo_cmd(){ if [ "$EUID" -eq 0 ]; then "$@"; else sudo "$@"; fi; }; need_cmd(){ command -v "$1" >/dev/null 2>&1; }
mark_failed(){ FAILED_STEPS+=("$1"); err "$1"; }
ask_step(){ local prompt="$1" allow_back="${2:-0}" ans; while true; do if [ "$allow_back" = "1" ]; then read -r -p "$prompt [Y=do / s=skip / b=back / q=quit]: " ans; else read -r -p "$prompt [Y=do / s=skip / q=quit]: " ans; fi; case "${ans:-Y}" in y|Y) return 0;; s|S) return 1;; b|B) [ "$allow_back" = "1" ] && return 2 || warn "Back is only available at first step";; q|Q) echo "Canceled."; exit 0;; *) warn "Type Y, s, q${allow_back:+, b}.";; esac; done; }
ask_yes_no(){ local ans hint default="${2:-y}"; [ "$default" = "y" ] && hint="Y/n" || hint="y/N"; read -r -p "$1 [$hint]: " ans; ans="${ans:-$default}"; [[ "$ans" =~ ^[Yy]$ ]]; }
pause_next(){ echo; ask_yes_no "Continue next step?" "y" || exit 0; }
install_pkg_if_missing(){ local cmd="$1" pkg="${2:-$1}"; if need_cmd "$cmd"; then ok "$cmd exists"; return 0; fi; warn "Missing $cmd, installing $pkg..."; sudo_cmd apt-get update -y && sudo_cmd apt-get install -y "$pkg"; }
backup_file(){ [ -f "$1" ] || return 0; local bak="$1.bak.$(date +%Y%m%d-%H%M%S)"; cp "$1" "$bak" && ok "Backup $1 -> $bak"; }
extract_version_from_name(){ echo "$1" | grep -oE '[0-9]+\.[0-9]+(\.[0-9]+)?' | head -n1; }
fetch_latest_asset(){ local repo="$1" pattern="$2" out="$3" label="$4" json url name version; json="$(curl -fsSL "https://api.github.com/repos/$repo/releases/latest")" || return 1; url="$(echo "$json"|jq -r ".assets[]? | select(.name|test(\"$pattern\")) | .browser_download_url"|head -n1)"; name="$(echo "$json"|jq -r ".assets[]? | select(.name|test(\"$pattern\")) | .name"|head -n1)"; version="$(extract_version_from_name "$name")"; [ -n "$url" ] || { err "No $label asset found in $repo" >&2; return 1; }; info "Downloading $label: $name" >&2; wget -q --show-progress -O "$out" "$url" >&2 || return 1; echo "$version"; }
wait_port(){ local port="$1" tries="${2:-20}"; for _ in $(seq 1 "$tries"); do ss -lntp 2>/dev/null|grep -q ":$port" && return 0; sleep 1; done; return 1; }
wait_lavalink(){ local tries="${1:-45}"; for _ in $(seq 1 "$tries"); do curl -fsS -H "Authorization: $LAVA_PASS" "http://localhost:$LAVA_PORT/v4/info" >/dev/null 2>&1 && return 0; sleep 2; done; return 1; }

docker_available(){ need_cmd docker && docker compose version >/dev/null 2>&1; }
setup_ytcipher_docker(){ [ ! -d yt-cipher ] && git clone "$YTCIPHER_REPO" yt-cipher; [ -d yt-cipher/.git ] && (cd yt-cipher && git pull --ff-only) || true; (cd yt-cipher && API_TOKEN="$REMOTE_CIPHER_PASSWORD" PORT="$REMOTE_CIPHER_PORT" docker compose up -d); }
setup_ytcipher_systemd(){ local deno_path; deno_path="$(command -v deno || echo "$HOME/.deno/bin/deno")"; sudo_cmd tee /etc/systemd/system/yt-cipher.service >/dev/null <<EOF
[Unit]
Description=yt-cipher remote cipher server
After=network.target
[Service]
Type=simple
User=$USER
WorkingDirectory=$SCRIPT_DIR/yt-cipher
ExecStart=$deno_path run --allow-net --allow-read --allow-write --allow-env $SCRIPT_DIR/yt-cipher/server.ts
Restart=always
RestartSec=5
Environment=API_TOKEN=$REMOTE_CIPHER_PASSWORD
Environment=PORT=$REMOTE_CIPHER_PORT
Environment=HOST=$REMOTE_CIPHER_HOST
Environment=OVERRIDE_PLAYER_VARIANT=IAS
[Install]
WantedBy=multi-user.target
EOF
sudo_cmd systemctl daemon-reload && sudo_cmd systemctl enable --now yt-cipher && sudo_cmd systemctl restart yt-cipher; }
setup_ytcipher_deno_full(){ install_pkg_if_missing unzip unzip||true; if ! need_cmd deno; then curl -fsSL https://deno.land/install.sh | sh || return 1; export DENO_INSTALL="$HOME/.deno"; export PATH="$DENO_INSTALL/bin:$PATH"; fi; [ ! -d yt-cipher ] && git clone "$YTCIPHER_REPO" yt-cipher; [ ! -d yt-cipher/ejs ] && git clone "$EJS_REPO" yt-cipher/ejs; (cd yt-cipher/ejs && git fetch --all --tags && git checkout "$EJS_COMMIT") || true; (cd yt-cipher && deno install --node-modules-dir=auto || true); (cd yt-cipher/ejs && deno install --node-modules-dir=auto || true); (cd yt-cipher && deno run --allow-read --allow-write ./scripts/patch-ejs.ts) || true; setup_ytcipher_systemd; }

test_ytcipher_direct(){ info "Running yt-cipher direct/log test. Press Ctrl+C to return."; if docker_available && [ -f yt-cipher/docker-compose.yml ]; then (cd yt-cipher && docker compose logs -f); else (cd yt-cipher && deno run --allow-net --allow-read --allow-write --allow-env server.ts); fi; }
test_lavalink_direct(){ info "Running Lavalink directly. Press Ctrl+C to return."; java -Xmx2G -jar Lavalink.jar; }
setup_lavalink_systemd(){ local java_path; java_path="$(command -v java || echo /usr/bin/java)"; sudo_cmd tee /etc/systemd/system/lavalink.service >/dev/null <<EOF
[Unit]
Description=Lavalink Server
After=network.target yt-cipher.service
Requires=yt-cipher.service
[Service]
Type=simple
User=$USER
WorkingDirectory=$SCRIPT_DIR
ExecStart=$java_path -Xmx2G -jar $SCRIPT_DIR/Lavalink.jar
Restart=always
RestartSec=10
[Install]
WantedBy=multi-user.target
EOF
sudo_cmd systemctl daemon-reload && sudo_cmd systemctl enable --now lavalink && sudo_cmd systemctl restart lavalink; }

lavalink_final_menu(){ local ans; while true; do header "[8] Lavalink final run"; echo "1. Run Lavalink test directly (Ctrl+C to stop)"; echo "2. Setup/restart Lavalink systemd"; echo "3. Finish and exit"; read -r -p "Choice [1-3, default 1]: " ans; case "${ans:-1}" in 1) test_lavalink_direct;; 2) setup_lavalink_systemd; if wait_lavalink 45; then ok "Lavalink /v4/info OK"; else mark_failed "Lavalink did not respond /v4/info"; fi;; 3) echo "Finished."; exit 0;; *) warn "Type 1-3";; esac; done; }
service_menu(){ local c; while true; do header "Service options"; echo "1. Restart Lavalink"; echo "2. Restart yt-cipher"; echo "3. Stop Lavalink"; echo "4. Stop yt-cipher"; echo "5. Stop all"; echo "6. Restart both (yt-cipher first)"; echo "7. Back"; read -r -p "Choice [1-7]: " c; case "$c" in 1) sudo_cmd systemctl restart lavalink;; 2) sudo_cmd systemctl restart yt-cipher;; 3) sudo_cmd systemctl stop lavalink;; 4) sudo_cmd systemctl stop yt-cipher;; 5) sudo_cmd systemctl stop lavalink; sudo_cmd systemctl stop yt-cipher;; 6) sudo_cmd systemctl restart yt-cipher; wait_port "$REMOTE_CIPHER_PORT" 20 || warn "yt-cipher port not ready"; sudo_cmd systemctl restart lavalink;; 7) return;; *) warn "Invalid";; esac; done; }

step_tools(){ header "[1] Check tools"; ask_step "Install/check required tools?" 1; r=$?; [ "$r" = "2" ] && return 2; [ "$r" = "1" ] && { pause_next; return; }; install_pkg_if_missing curl curl; install_pkg_if_missing wget wget; install_pkg_if_missing jq jq; install_pkg_if_missing unzip unzip; install_pkg_if_missing git git; install_pkg_if_missing java default-jre; install_pkg_if_missing ss iproute2||true; pause_next; }
step_lavalink_jar(){ header "[2] Lavalink.jar"; if [ -s Lavalink.jar ]; then ok "Lavalink.jar exists"; ask_yes_no "Download latest again?" "n" || { pause_next; return; }; backup_file Lavalink.jar; else ask_step "Download latest Lavalink.jar?" || { mark_failed "Missing Lavalink.jar"; pause_next; return; }; fi; local ver tmp="Lavalink.jar.download"; ver="$(fetch_latest_asset "$LAVALINK_REPO" '^Lavalink\\.jar$' "$tmp" Lavalink)" && mv "$tmp" Lavalink.jar && ok "Lavalink $ver ready" || mark_failed "Download Lavalink failed"; rm -f "$tmp"; pause_next; }
step_plugins(){ header "[3] Plugins"; mkdir -p plugins; if ls plugins/youtube-plugin-*.jar plugins/lavasrc-plugin-*.jar >/dev/null 2>&1; then ok "Plugins exist"; ask_yes_no "Check/download latest plugins?" "n" || { pause_next; return; }; fi; ask_step "Download/update plugins?" || { pause_next; return; }; local tmp ver; tmp="plugins/youtube-plugin.download.jar"; ver="$(fetch_latest_asset "$YOUTUBE_REPO" '^youtube-plugin-[0-9].*\\.jar$' "$tmp" youtube-plugin)"; [ -s "$tmp" ] && { YOUTUBE_PLUGIN_VERSION="$ver"; rm -f plugins/youtube-plugin-*.jar; mv "$tmp" "plugins/youtube-plugin-$ver.jar"; }; tmp="plugins/lavasrc-plugin.download.jar"; ver="$(fetch_latest_asset "$LAVASRC_REPO" '^lavasrc-plugin-[0-9].*\\.jar$' "$tmp" lavasrc-plugin)"; [ -s "$tmp" ] && { LAVASRC_PLUGIN_VERSION="$ver"; rm -f plugins/lavasrc-plugin-*.jar; mv "$tmp" "plugins/lavasrc-plugin-$ver.jar"; }; pause_next; }
detect_ipv6(){ local p; p="$(ip -6 addr show scope global 2>/dev/null|awk '/inet6/{print $2}'|cut -d: -f1,2,3,4|head -n1)"; [ -n "$p" ] && echo "${p}::/64"; }
step_collect_config(){ header "[4] Config input"; ask_step "Enter/update config?" || { pause_next; return; }; local input def6; read -r -p "Lavalink port [$LAVA_PORT]: " input; LAVA_PORT="${input:-$LAVA_PORT}"; read -r -p "Lavalink password [$LAVA_PASS]: " input; LAVA_PASS="${input:-$LAVA_PASS}"; read -r -p "Bind address [$LAVA_ADDRESS]: " input; LAVA_ADDRESS="${input:-$LAVA_ADDRESS}"; read -r -p "yt-cipher port [$REMOTE_CIPHER_PORT]: " input; REMOTE_CIPHER_PORT="${input:-$REMOTE_CIPHER_PORT}"; read -r -p "yt-cipher token [$REMOTE_CIPHER_PASSWORD]: " input; REMOTE_CIPHER_PASSWORD="${input:-$REMOTE_CIPHER_PASSWORD}"; REMOTE_CIPHER_URL="http://localhost:$REMOTE_CIPHER_PORT"; def6="$(detect_ipv6)"; if ask_yes_no "Enable IPv6 routePlanner?" "n"; then ENABLE_IPV6=true; read -r -p "IPv6 block [$def6]: " input; IPV6_BLOCK="${input:-$def6}"; fi; pause_next; }
step_application_yml(){ header "[5] application.yml"; [ -f example.vps.application.yml ] || { mark_failed "Missing example.vps.application.yml"; pause_next; return; }; ask_step "Generate application.yml from template?" || { pause_next; return; }; backup_file application.yml; cp example.vps.application.yml application.yml || return; sed -i "s|port: 3333|port: $LAVA_PORT|; s|address: 0.0.0.0|address: $LAVA_ADDRESS|; s|password: \"takeshi\"|password: \"$LAVA_PASS\"|; s|youtube-plugin:[0-9][0-9.]*|youtube-plugin:$YOUTUBE_PLUGIN_VERSION|; s|lavasrc-plugin:[0-9][0-9.]*|lavasrc-plugin:$LAVASRC_PLUGIN_VERSION|; s|url: \"http://localhost:8001\"|url: \"$REMOTE_CIPHER_URL\"|; s|password: \"test\"|password: \"$REMOTE_CIPHER_PASSWORD\"|" application.yml; [ "$ENABLE_IPV6" = true ] && [ -n "$IPV6_BLOCK" ] && sed -i "s|\[IP_ADDRESS\]|$IPV6_BLOCK|" application.yml || sed -i '/routePlanner:/,+3 s/^/    # disabled: /' application.yml; pause_next; }
step_yt_cipher(){ header "[6] yt-cipher"; ask_step "Setup/update yt-cipher?" || { warn "Skipped yt-cipher"; pause_next; return; }; install_pkg_if_missing git git||true; local method ans; if docker_available; then echo "Docker Compose detected:"; echo "1. Docker Compose (recommended)"; echo "2. Deno + systemd"; echo "3. Skip"; read -r -p "Choice [1-3, default 1]: " ans; case "${ans:-1}" in 1) method=docker;; 2) method=deno;; 3) pause_next; return;; *) method=docker;; esac; else warn "Docker Compose not found, using Deno"; method=deno; fi; [ "$method" = docker ] && setup_ytcipher_docker || setup_ytcipher_deno_full; wait_port "$REMOTE_CIPHER_PORT" 25 && ok "yt-cipher OK" || mark_failed "yt-cipher not listening"; pause_next; }
step_network(){ header "[7] Network/firewall"; ask_step "Apply network/firewall?" || { pause_next; return; }; [ "$OPEN_UFW" = true ] && need_cmd ufw && sudo_cmd ufw allow "$LAVA_PORT/tcp"||true; pause_next; }
step_lavalink_service(){ [ ! -s Lavalink.jar ] || [ ! -f application.yml ] && { mark_failed "Missing Lavalink.jar or application.yml"; return; }; lavalink_final_menu; }
show_status(){ header "Status"; sudo_cmd systemctl status yt-cipher --no-pager||true; echo; sudo_cmd systemctl status lavalink --no-pager||true; echo; ss -lntp 2>/dev/null|grep -E "3333|8001|:$LAVA_PORT|:$REMOTE_CIPHER_PORT"||true; }
setup_wizard(){ FAILED_STEPS=(); header "Lavalink setup wizard"; step_tools; [ "$?" = "2" ] && return; step_lavalink_jar; step_plugins; step_collect_config; step_application_yml; step_yt_cipher; step_network; step_lavalink_service; }
while true; do header "Lavalink Manager"; echo "1. Setup Lavalink / yt-cipher / plugins"; echo "2. Lavalink + yt-cipher options"; echo "3. View Lavalink log"; echo "4. View yt-cipher log"; echo "5. Service + port status"; echo "6. Run Lavalink test"; echo "7. Exit"; read -r -p "Choice [1-7]: " MENU_CHOICE; case "$MENU_CHOICE" in 1) setup_wizard;; 2) service_menu;; 3) sudo_cmd journalctl -u lavalink -f -n 100;; 4) sudo_cmd journalctl -u yt-cipher -f -n 100;; 5) show_status;; 6) test_lavalink_direct;; 7) exit 0;; *) err "Invalid choice";; esac; echo; read -r -p "Press Enter to return menu..." _; done

