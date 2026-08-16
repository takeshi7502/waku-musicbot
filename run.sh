#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

COMPOSE=()

run_as_root() {
  if [[ "$EUID" -eq 0 ]]; then
    "$@"
  else
    sudo "$@"
  fi
}

detect_compose() {
  if ! command -v docker >/dev/null 2>&1; then
    return 1
  fi

  if docker compose version >/dev/null 2>&1; then
    COMPOSE=(docker compose)
    return 0
  fi

  if command -v docker-compose >/dev/null 2>&1; then
    COMPOSE=(docker-compose)
    return 0
  fi

  return 1
}

compose() {
  if docker info >/dev/null 2>&1; then
    "${COMPOSE[@]}" "$@"
  else
    run_as_root "${COMPOSE[@]}" "$@"
  fi
}

pause_menu() {
  read -r -p "Nhấn Enter để tiếp tục..." _
}

ensure_curl() {
  command -v curl >/dev/null 2>&1 && return 0

  if command -v apt-get >/dev/null 2>&1; then
    run_as_root apt-get update
    run_as_root apt-get install -y curl
    return
  fi

  echo "Không tìm thấy curl. Hãy cài curl rồi chạy lại."
  return 1
}

install_docker_if_needed() {
  if ! command -v docker >/dev/null 2>&1; then
    echo "Docker chưa được cài. Cài Docker Engine cho Linux ngay bây giờ?"
    read -r -p "Nhập y để tiếp tục: " answer
    if [[ "$answer" != "y" && "$answer" != "Y" ]]; then
      echo "Đã huỷ cài Docker."
      return 1
    fi
    ensure_curl || return 1
    curl -fsSL https://get.docker.com | run_as_root sh
    run_as_root usermod -aG docker "$USER" || true
    echo "Docker đã được cài. Đăng xuất/đăng nhập lại để dùng Docker không cần sudo."
  fi

  if ! detect_compose; then
    if command -v apt-get >/dev/null 2>&1; then
      run_as_root apt-get update
      run_as_root apt-get install -y docker-compose-plugin
    else
      echo "Không tự cài được Docker Compose trên hệ điều hành này."
      return 1
    fi
  fi

  detect_compose || {
    echo "Không tìm thấy Docker Compose."
    return 1
  }
}

require_docker() {
  if ! detect_compose; then
    echo "Docker hoặc Docker Compose chưa sẵn sàng. Hãy chạy mục Thiết lập bot trước."
    return 1
  fi
}

escape_sed() {
  printf '%s' "$1" | sed -e 's/[\\&|]/\\&/g' -e 's/"/\\"/g'
}

prompt_required() {
  local variable_name="$1"
  local prompt="$2"
  local secret="${3:-false}"
  local value

  while true; do
    if [[ "$secret" == "true" ]]; then
      read -r -s -p "$prompt" value
      echo
    else
      read -r -p "$prompt" value
    fi
    if [[ -n "$value" ]]; then
      printf -v "$variable_name" '%s' "$value"
      return
    fi
    echo "Không được để trống."
  done
}

prompt_optional() {
  local variable_name="$1"
  local prompt="$2"
  local default_value="$3"
  local value

  read -r -p "$prompt [$default_value]: " value
  printf -v "$variable_name" '%s' "${value:-$default_value}"
}

valid_port() {
  [[ "$1" =~ ^[0-9]{1,5}$ ]] && ((10#$1 >= 1 && 10#$1 <= 65535))
}

test_lavalink() {
  local host="$1"
  local port="$2"
  local password="$3"
  local secure="$4"
  local protocol="http"
  [[ "$secure" == "true" ]] && protocol="https"

  local status_code
  status_code="$(curl --connect-timeout 5 --max-time 8 -sS -o /dev/null -w "%{http_code}" -H "Authorization: $password" "$protocol://$host:$port/v4/info" || true)"
  [[ "$status_code" == "200" ]]
}

read_lavalink_values() {
  if [[ ! -f config.js ]]; then
    echo "Thiếu config.js."
    return 1
  fi

  CURRENT_LAVA_HOST="$(sed -n -E '0,/^[[:space:]]*host:[[:space:]]*"([^"]+)".*/s//\1/p' config.js)"
  CURRENT_LAVA_PORT="$(sed -n -E '0,/^[[:space:]]*port:[[:space:]]*([0-9]+).*/s//\1/p' config.js)"
  CURRENT_LAVA_AUTH="$(sed -n -E '0,/^[[:space:]]*authorization:[[:space:]]*"([^"]+)".*/s//\1/p' config.js)"
  CURRENT_LAVA_SECURE="$(sed -n -E '0,/^[[:space:]]*secure:[[:space:]]*(true|false).*/s//\1/p' config.js)"
  CURRENT_LAVA_HOST="${CURRENT_LAVA_HOST:-127.0.0.1}"
  CURRENT_LAVA_PORT="${CURRENT_LAVA_PORT:-2333}"
  CURRENT_LAVA_AUTH="${CURRENT_LAVA_AUTH:-youshallnotpass}"
  CURRENT_LAVA_SECURE="${CURRENT_LAVA_SECURE:-false}"
}

collect_lavalink_configuration() {
  local default_host="$1"
  local default_port="$2"
  local default_auth="$3"
  local default_secure="$4"
  local secure_choice
  local secure_default_choice=1

  [[ "$default_secure" == "true" ]] && secure_default_choice=2
  ensure_curl || return 1

  while true; do
    prompt_optional LAVA_HOST "Lavalink host" "$default_host"
    prompt_optional LAVA_PORT "Lavalink port" "$default_port"
    valid_port "$LAVA_PORT" || {
      echo "Port không hợp lệ."
      continue
    }

    read -r -s -p "Lavalink authorization [Enter để giữ giá trị hiện tại]: " LAVA_AUTH
    echo
    LAVA_AUTH="${LAVA_AUTH:-$default_auth}"

    echo "Secure: 1) HTTP/WSS  2) HTTPS/WSS"
    read -r -p "Chọn [$secure_default_choice]: " secure_choice
    if [[ "$secure_choice" == "2" ]]; then
      LAVA_SECURE=true
    elif [[ "$secure_choice" == "1" ]]; then
      LAVA_SECURE=false
    else
      LAVA_SECURE="$default_secure"
    fi

    echo "Đang kiểm tra Lavalink tại $LAVA_HOST:$LAVA_PORT..."
    if test_lavalink "$LAVA_HOST" "$LAVA_PORT" "$LAVA_AUTH" "$LAVA_SECURE"; then
      echo "Kết nối Lavalink thành công."
      return
    fi
    echo "Không nhận được HTTP 200 từ /v4/info. Kiểm tra host, port, secure và authorization."
  done
}

write_initial_config() {
  local admin_escaped token_escaped client_escaped status_escaped name_escaped host_escaped auth_escaped
  admin_escaped="$(escape_sed "$BOT_ADMIN")"
  token_escaped="$(escape_sed "$BOT_TOKEN")"
  client_escaped="$(escape_sed "$BOT_CLIENT_ID")"
  status_escaped="$(escape_sed "$BOT_STATUS")"
  name_escaped="$(escape_sed "$BOT_ACTIVITY_TEXT")"
  host_escaped="$(escape_sed "$LAVA_HOST")"
  auth_escaped="$(escape_sed "$LAVA_AUTH")"

  sed -i -E \
    -e "s|^[[:space:]]*adminId:.*|  adminId: \"$admin_escaped\",|" \
    -e "s|^[[:space:]]*token:.*|  token: \"$token_escaped\",|" \
    -e "s|^[[:space:]]*clientId:.*|  clientId: \"$client_escaped\",|" \
    -e "0,/^[[:space:]]*host:/s|^[[:space:]]*host:.*|      host: \"$host_escaped\",|" \
    -e "0,/^[[:space:]]*port:/s|^[[:space:]]*port:.*|      port: $LAVA_PORT,|" \
    -e "0,/^[[:space:]]*authorization:/s|^[[:space:]]*authorization:.*|      authorization: \"$auth_escaped\",|" \
    -e "0,/^[[:space:]]*secure:/s|^[[:space:]]*secure:.*|      secure: $LAVA_SECURE,|" \
    -e "0,/^[[:space:]]*status:/s|^[[:space:]]*status:.*|      status: \"$status_escaped\",|" \
    -e "0,/^[[:space:]]*name:/s|^[[:space:]]*name:.*|        name: \"$name_escaped\",|" \
    -e "0,/^[[:space:]]*type:/s|^[[:space:]]*type:.*|        type: $BOT_ACTIVITY_TYPE,|" \
    -e "0,/^[[:space:]]*state:/s|^[[:space:]]*state:.*|        state: \"$name_escaped\",|" \
    config.js

  chmod 600 config.js
}

update_lavalink_config() {
  local host_escaped auth_escaped
  host_escaped="$(escape_sed "$LAVA_HOST")"
  auth_escaped="$(escape_sed "$LAVA_AUTH")"

  sed -i -E \
    -e "0,/^[[:space:]]*host:/s|^[[:space:]]*host:.*|      host: \"$host_escaped\",|" \
    -e "0,/^[[:space:]]*port:/s|^[[:space:]]*port:.*|      port: $LAVA_PORT,|" \
    -e "0,/^[[:space:]]*authorization:/s|^[[:space:]]*authorization:.*|      authorization: \"$auth_escaped\",|" \
    -e "0,/^[[:space:]]*secure:/s|^[[:space:]]*secure:.*|      secure: $LAVA_SECURE,|" \
    config.js
  chmod 600 config.js
}

ensure_public_status_config() {
  [[ -f config.js ]] || return 1
  if grep -q "^[[:space:]]*publicStatusApi:[[:space:]]*{" config.js; then
    if ! sed -n -E '/^[[:space:]]*publicStatusApi:[[:space:]]*\{/,/^[[:space:]]*\},/ { s/^[[:space:]]*domain:.*/domain/p; }' config.js | grep -q .; then
      local existing_temporary
      existing_temporary="$(mktemp)"
      awk '
        /^[[:space:]]*publicStatusApi:[[:space:]]*\{/ { in_public_status_api = 1 }
        in_public_status_api && /^[[:space:]]*\},/ {
          print "\t\tdomain: \"status.example.com\","
          in_public_status_api = 0
        }
        { print }
      ' config.js > "$existing_temporary"
      mv "$existing_temporary" config.js
      chmod 600 config.js
    fi
    return
  fi
  grep -q "WEB DASHBOARD" config.js || {
    echo "Cannot add the public API configuration to config.js automatically."
    return 1
  }

  local temporary
  temporary="$(mktemp)"
  awk '
    /WEB DASHBOARD/ && !inserted {
      print "\t// ====== PUBLIC STATUS API (optional) ======"
      print "\tpublicStatusApi: {"
      print "\t\tenabled: false,"
      print "\t\thost: \"127.0.0.1\","
      print "\t\tport: 3000,"
      print "\t\tdomain: \"status.example.com\","
      print "\t},"
      inserted = 1
    }
    { print }
  ' config.js > "$temporary"
  mv "$temporary" config.js
  chmod 600 config.js
}

read_public_status_values() {
  ensure_public_status_config || return 1
  CURRENT_PUBLIC_STATUS_ENABLED="$(sed -n -E '/^[[:space:]]*publicStatusApi:[[:space:]]*\{/,/^[[:space:]]*\},/ { s/^[[:space:]]*enabled:[[:space:]]*(true|false).*/\1/p; }' config.js | head -n 1)"
  CURRENT_PUBLIC_STATUS_HOST="$(sed -n -E '/^[[:space:]]*publicStatusApi:[[:space:]]*\{/,/^[[:space:]]*\},/ { s/^[[:space:]]*host:[[:space:]]*"([^"]+)".*/\1/p; }' config.js | head -n 1)"
  CURRENT_PUBLIC_STATUS_PORT="$(sed -n -E '/^[[:space:]]*publicStatusApi:[[:space:]]*\{/,/^[[:space:]]*\},/ { s/^[[:space:]]*port:[[:space:]]*([0-9]+).*/\1/p; }' config.js | head -n 1)"
  CURRENT_PUBLIC_STATUS_DOMAIN="$(sed -n -E '/^[[:space:]]*publicStatusApi:[[:space:]]*\{/,/^[[:space:]]*\},/ { s/^[[:space:]]*domain:[[:space:]]*"([^"]+)".*/\1/p; }' config.js | head -n 1)"
  CURRENT_PUBLIC_STATUS_ENABLED="${CURRENT_PUBLIC_STATUS_ENABLED:-false}"
  CURRENT_PUBLIC_STATUS_HOST="${CURRENT_PUBLIC_STATUS_HOST:-127.0.0.1}"
  CURRENT_PUBLIC_STATUS_PORT="${CURRENT_PUBLIC_STATUS_PORT:-3000}"
  CURRENT_PUBLIC_STATUS_DOMAIN="${CURRENT_PUBLIC_STATUS_DOMAIN:-status.example.com}"
}

api_is_enabled() {
  read_public_status_values || return 1
  [[ "$CURRENT_PUBLIC_STATUS_ENABLED" == "true" ]]
}

update_public_status_config() {
  local enabled="$1"
  local host="$2"
  local port="$3"
  local domain="$4"
  local host_escaped domain_escaped
  host_escaped="$(escape_sed "$host")"
  domain_escaped="$(escape_sed "$domain")"

  ensure_public_status_config || return 1
  sed -i -E \
    -e "/^[[:space:]]*publicStatusApi:[[:space:]]*\{/,/^[[:space:]]*\},/s|^[[:space:]]*enabled:.*|    enabled: $enabled,|" \
    -e "/^[[:space:]]*publicStatusApi:[[:space:]]*\{/,/^[[:space:]]*\},/s|^[[:space:]]*host:.*|    host: \"$host_escaped\",|" \
    -e "/^[[:space:]]*publicStatusApi:[[:space:]]*\{/,/^[[:space:]]*\},/s|^[[:space:]]*port:.*|    port: $port,|" \
    -e "/^[[:space:]]*publicStatusApi:[[:space:]]*\{/,/^[[:space:]]*\},/s|^[[:space:]]*domain:.*|    domain: \"$domain_escaped\",|" \
    config.js
  chmod 600 config.js
}

write_caddyfile() {
  local domain="$1"
  local port="$2"
  printf '%s\n' "$domain {" "    reverse_proxy 127.0.0.1:$port" "}" > Caddyfile
}

ensure_config() {
  if [[ -f config.js ]]; then
    ensure_public_status_config
    return
  fi

  [[ -f config_example.js ]] || {
    echo "Thiếu config_example.js."
    return 1
  }

  cp config_example.js config.js
  echo "Thiết lập config.js lần đầu."
  prompt_required BOT_ADMIN "Discord Admin ID: "
  prompt_required BOT_TOKEN "Discord Bot Token: " true
  prompt_required BOT_CLIENT_ID "Discord Client ID: "

  echo "Trạng thái: 1) online  2) idle  3) dnd  4) invisible"
  read -r -p "Chọn [1]: " status_choice
  case "$status_choice" in
    2) BOT_STATUS=idle ;;
    3) BOT_STATUS=dnd ;;
    4) BOT_STATUS=invisible ;;
    *) BOT_STATUS=online ;;
  esac

  prompt_optional BOT_ACTIVITY_TEXT "Nội dung activity" "Playing Music | /play"
  echo "Loại activity: 0) Playing  1) Streaming  2) Listening  3) Watching  4) Bóng bóng  5) Competing"
  read -r -p "Chọn [3]: " type_choice
  case "$type_choice" in
    0|1|2|3|4|5) BOT_ACTIVITY_TYPE="$type_choice" ;;
    *) BOT_ACTIVITY_TYPE=3 ;;
  esac

  collect_lavalink_configuration 127.0.0.1 2333 youshallnotpass false
  write_initial_config
  ensure_public_status_config
  echo "Đã tạo config.js. API web đang tắt mặc định."
}

check_lavalink() {
  ensure_curl || return
  read_lavalink_values || return
  local protocol=http
  [[ "$CURRENT_LAVA_SECURE" == "true" ]] && protocol=https
  echo "Kiểm tra $protocol://$CURRENT_LAVA_HOST:$CURRENT_LAVA_PORT/v4/info"

  if test_lavalink "$CURRENT_LAVA_HOST" "$CURRENT_LAVA_PORT" "$CURRENT_LAVA_AUTH" "$CURRENT_LAVA_SECURE"; then
    echo "Lavalink đang trực tuyến."
  else
    echo "Không thể kết nối Lavalink. Kiểm tra cấu hình hoặc node."
  fi
}

deploy_commands() {
  require_docker || return
  [[ -f config.js ]] || {
    echo "Hãy thiết lập config.js trước."
    return
  }
  echo "Đang đăng ký slash command lên Discord..."
  compose run --rm --no-deps discordmusicbot npm run deploy
}

start_stack() {
  if api_is_enabled; then
    compose --profile web-api up -d --remove-orphans discordmusicbot caddy
  else
    compose --profile web-api stop caddy >/dev/null 2>&1 || true
    compose up -d --remove-orphans discordmusicbot
  fi
}

rebuild_bot() {
  require_docker || return
  [[ -f config.js ]] || {
    echo "Hãy chạy mục Thiết lập bot trước."
    return
  }
  ensure_public_status_config
  mkdir -p data
  echo "Đang build lại image bot..."
  compose build --pull discordmusicbot
  start_stack
  echo "Bot đã được build và khởi động."
}

setup_bot() {
  install_docker_if_needed || return
  ensure_config || return
  rebuild_bot
  deploy_commands
  echo "Hoàn tất. Dùng mục Quản trị bot để xem log hoặc thay đổi Lavalink."
}

change_lavalink() {
  [[ -f config.js ]] || {
    echo "Hãy thiết lập config.js trước."
    return
  }
  read_lavalink_values
  collect_lavalink_configuration "$CURRENT_LAVA_HOST" "$CURRENT_LAVA_PORT" "$CURRENT_LAVA_AUTH" "$CURRENT_LAVA_SECURE"
  update_lavalink_config
  echo "Đã lưu node Lavalink mới. Khởi động lại bot để áp dụng."
}

restart_bot() {
  require_docker || return
  if api_is_enabled; then
    compose --profile web-api restart discordmusicbot caddy
  else
    compose restart discordmusicbot
  fi
  echo "Đã khởi động lại bot."
}

stop_bot() {
  require_docker || return
  compose --profile web-api down --remove-orphans
  echo "Đã dừng bot và API web (nếu đang chạy)."
}

show_logs() {
  require_docker || return
  compose logs -f --tail=100 discordmusicbot
}

show_guide() {
  cat <<'GUIDE'

HƯỚNG DẪN NHANH
- Sửa commands, events, lib hoặc util: chọn Build lại bot.
- Thêm/đổi tên slash command: chọn Deploy slash command, rồi Build lại bot.
- Đổi node Lavalink: dùng mục Thay đổi Lavalink, sau đó Restart bot.
- API web: chỉ bật khi đã có domain trỏ về VPS và mở cổng 80/443.
- Không cần xoá data khi build; dữ liệu runtime được giữ trong thư mục data.

GUIDE
  pause_menu
}

setup_web_api() {
  require_docker || return
  [[ -f config.js ]] || {
    echo "Hãy thiết lập bot trước."
    return
  }
  local default_domain domain default_port api_port
  read_public_status_values || return
  default_domain="$CURRENT_PUBLIC_STATUS_DOMAIN"
  prompt_optional domain "Tên miền API web, ví dụ status.example.com" "$default_domain"
  [[ "$domain" =~ ^[A-Za-z0-9.-]+$ ]] || {
    echo "Tên miền không hợp lệ."
    return
  }

  default_port="$CURRENT_PUBLIC_STATUS_PORT"
  prompt_optional api_port "Cổng nội bộ API" "$default_port"
  valid_port "$api_port" || {
    echo "Port không hợp lệ."
    return
  }

  echo "Yêu cầu: DNS của $domain phải trỏ về VPS, đồng thời mở TCP 80 và 443."
  read -r -p "Tiếp tục bật API web? [y/N]: " confirm
  [[ "$confirm" == "y" || "$confirm" == "Y" ]] || return

  update_public_status_config true 127.0.0.1 "$api_port" "$domain"
  write_caddyfile "$domain" "$api_port"

  compose --profile web-api up -d --force-recreate discordmusicbot caddy
  echo "API web đã bật: https://$domain/api/public-status"
  echo "Caddy sẽ tự xin/gia hạn HTTPS sau khi DNS và cổng 80/443 sẵn sàng."
}

stop_web_api() {
  require_docker || return
  read_public_status_values || return
  update_public_status_config false "$CURRENT_PUBLIC_STATUS_HOST" "$CURRENT_PUBLIC_STATUS_PORT" "$CURRENT_PUBLIC_STATUS_DOMAIN"
  compose --profile web-api stop caddy >/dev/null 2>&1 || true
  compose --profile web-api rm -f caddy >/dev/null 2>&1 || true
  compose up -d --force-recreate discordmusicbot
  echo "Đã tắt API web và Caddy. Bot nhạc vẫn chạy."
}

show_web_api_status() {
  require_docker || return
  read_public_status_values || return
  if api_is_enabled; then
    echo "API web: đang bật"
    echo "Tên miền: $CURRENT_PUBLIC_STATUS_DOMAIN"
    echo "Endpoint: https://$CURRENT_PUBLIC_STATUS_DOMAIN/api/public-status"
  else
    echo "API web: đang tắt"
  fi
  compose --profile web-api ps
}

web_api_menu() {
  while true; do
    echo
    echo "=== API WEB CÔNG KHAI ==="
    echo "1) Bật / cấu hình API web"
    echo "2) Tắt hoàn toàn API web"
    echo "3) Xem trạng thái"
    echo "0) Quay lại"
    read -r -p "Chọn: " choice
    case "$choice" in
      1) setup_web_api ;;
      2) stop_web_api ;;
      3) show_web_api_status ;;
      0) return ;;
      *) echo "Lựa chọn không hợp lệ." ;;
    esac
  done
}

manage_bot_menu() {
  while true; do
    echo
    echo "=== QUẢN TRỊ BOT ==="
    echo "1) Build lại bot từ source hiện tại"
    echo "2) Kiểm tra Lavalink"
    echo "3) Thay đổi Lavalink"
    echo "4) Tắt bot"
    echo "5) Khởi động lại bot"
    echo "6) Xem log bot"
    echo "7) Hướng dẫn nhanh"
    echo "8) Deploy slash command"
    echo "0) Quay lại"
    read -r -p "Chọn: " choice
    case "$choice" in
      1) rebuild_bot ;;
      2) check_lavalink; pause_menu ;;
      3) change_lavalink ;;
      4) stop_bot ;;
      5) restart_bot ;;
      6) show_logs ;;
      7) show_guide ;;
      8) deploy_commands ;;
      0) return ;;
      *) echo "Lựa chọn không hợp lệ." ;;
    esac
  done
}

while true; do
  echo
  echo "========================================"
  echo "       QUẢN LÝ DISCORD MUSIC BOT"
  echo "========================================"
  echo "1) Thiết lập bot lần đầu / build bot"
  echo "2) Quản trị bot"
  echo "3) API web công khai (tuỳ chọn)"
  echo "0) Thoát"
  read -r -p "Chọn: " choice

  case "$choice" in
    1) setup_bot ;;
    2) manage_bot_menu ;;
    3) web_api_menu ;;
    0) exit 0 ;;
    *) echo "Lựa chọn không hợp lệ." ;;
  esac
done
