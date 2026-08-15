#!/bin/bash
set -e

echo "========================================================"
echo "      🤖 CÀI ĐẶT LAVAMUSIC BOT TRÊN VPS LẦN ĐẦU 🤖      "
echo "========================================================"

# ==========================================
# 0. KIỂM TRA VÀ CÀI ĐẶT DOCKER TỰ ĐỘNG
# ==========================================
if ! command -v docker &> /dev/null; then
    echo "⚠️  Docker chưa được cài đặt! Đang tiến hành cài đặt tự động (Có thể mất vài phút)..."
    curl -fsSL https://get.docker.com | sh
    sudo usermod -aG docker $USER || true
    echo "✅ Cài đặt Docker hoàn tất!"
fi

if ! docker compose version &> /dev/null; then
    if ! docker-compose version &> /dev/null; then
        echo "⚠️  Docker Compose chưa được cài đặt! Đang cài Plugin Compose..."
        sudo apt-get update && sudo apt-get install -y docker-compose-plugin || echo "❌ Chú ý: Không thể tự cài Docker Compose, vui lòng kiểm tra lại."
    else
        # Tương thích với bản cũ lệnh có dấu gạch ngang
        shopt -s expand_aliases
        alias docker compose="docker-compose"
    fi
fi

echo "✅ Môi trường Docker đã sẵn sàng."

# ==========================================
# 1. KIỂM TRA FILE CONFIG & THIẾT LẬP THÔNG TIN
# ==========================================
if [ ! -f "config.js" ]; then
    echo "📝 Không tìm thấy config.js hiện tại."
    echo "📝 Đang chuẩn bị tệp cấu hình (Bản Mới) từ config_example.js..."
    cp config_example.js config.js

    echo "--------------------------------------------------------"
    echo "🛠️  THÔNG TIN KẾT NỐI DISCORD (Bắt buộc)"

    read -p "Nhập Admin ID của bạn (VD: 648036...): " bot_admin
    while [[ -z "$bot_admin" ]]; do
        read -p "❌ Không được để trống. Nhập lại Admin ID: " bot_admin
    done

    read -p "Nhập Bot Token (VD: MTE2Mj...): " bot_token
    while [[ -z "$bot_token" ]]; do
        read -p "❌ Không được để trống. Nhập lại Bot Token: " bot_token
    done

    read -p "Nhập Bot Client ID (VD: 1162333...): " bot_client
    while [[ -z "$bot_client" ]]; do
        read -p "❌ Không được để trống. Nhập lại Client ID: " bot_client
    done

    echo "--------------------------------------------------------"
    echo "🎮  Trạng thái hoạt động (Status)"
    echo "1) online (Mặc định)   - Sáng đèn xanh"
    echo "2) idle                - Trăng khuyết cam"
    echo "3) dnd                 - Cấm làm phiền đỏ"
    echo "4) invisible           - Ẩn nick"
    read -p "Chọn (1-4) [Enter = 1]: " status_input

    case $status_input in
        2) bot_status="idle" ;;
        3) bot_status="dnd" ;;
        4) bot_status="invisible" ;;
        *) bot_status="online" ;;
    esac

    echo "--------------------------------------------------------"
    read -p "Tên hiển thị bên cạnh trạng thái (VD: Nhạc Lo-fi) [Enter = ANIME]: " bot_name
    if [[ -z "$bot_name" ]]; then
        bot_name="ANIME"
    fi

    echo "--------------------------------------------------------"
    echo "🎬  Kiểu Trạng Thái (Type)"
    echo "0) Playing (Đang chơi...)"
    echo "1) Streaming (Đang phát sóng...)"
    echo "2) Listening (Đang nghe...)"
    echo "3) Watching (Đang xem...) (Mặc định)"
    echo "5) Competing (Đang thi đấu...)"
    read -p "Chọn (0,1,2,3,5) [Enter = 3]: " type_input

    case $type_input in
        0) bot_type="0" ;;
        1) bot_type="1" ;;
        2) bot_type="2" ;;
        5) bot_type="5" ;;
        *) bot_type="3" ;;
    esac

    sed -i "s|^.*adminId: .*|\tadminId: \"$bot_admin\",|g" config.js
    sed -i "s|^.*token: .*|\ttoken: \"$bot_token\",|g" config.js
    sed -i "s|^.*clientId: .*|\tclientId: \"$bot_client\",|g" config.js

    sed -i "s/status: \"online\"/status: \"$bot_status\"/g" config.js
    sed -i "s/name: \"ANIME\"/name: \"$bot_name\"/g" config.js
    sed -i "s/type: 3/type: $bot_type/g" config.js

    while true; do
        echo "--------------------------------------------------------"
        echo "🖥️  CẤU HÌNH LAVALINK SERVER (Lần đầu)"
        
        read -p "Nhập Lavalink Host (Bắt buộc, VD: lavalink.example.com): " lava_host
        while [[ -z "$lava_host" ]]; do
            read -p "❌ Không được để trống. Nhập lại Lavalink Host: " lava_host
        done

        read -p "Nhập Lavalink Port (Bắt buộc, VD: 443 hoặc 80): " lava_port
        while [[ -z "$lava_port" ]]; do
            read -p "❌ Không được để trống. Nhập lại Lavalink Port: " lava_port
        done

        read -p "Nhập Lavalink Authorization (Bắt buộc): " lava_auth
        while [[ -z "$lava_auth" ]]; do
            read -p "❌ Không được để trống. Nhập Authorization: " lava_auth
        done

        echo "Chọn bảo mật Secure (Sử dụng HTTPS/WSS):"
        echo "1) False (Mặc định - Dành cho HTTP)"
        echo "2) True (Dành cho HTTPS)"
        read -p "Chọn (1 hoặc 2) [Enter = 1]: " secure_input

        if [[ "$secure_input" == "2" ]]; then
            lava_secure="true"
            proto="https"
        else
            lava_secure="false"
            proto="http"
        fi

        echo "⏳ Đang kiểm tra kết nối tới Lavalink ($proto://$lava_host:$lava_port)..."
        
        status_code=$(curl -m 5 -s -o /dev/null -w "%{http_code}" -H "Authorization: $lava_auth" "$proto://$lava_host:$lava_port/v4/info" || echo "failed")
        
        if [[ "$status_code" == "200" ]] || [[ "$status_code" == "404" ]]; then
            echo "✅ Kiểm tra phản hồi Lavalink thành công!"
            break
        else
            echo "❌ Kết nối thất bại (Mã lỗi: $status_code). Vui lòng thử lại!"
            echo "   Mẹo: Nếu port là 443 thì Secure nên chọn là 2 (True)."
        fi
    done

    echo "📝 Đang lưu cấu hình Lavalink vào config.js..."
    lava_host_esc=$(echo "$lava_host" | sed -e 's/[\/&]/\\&/g')
    lava_auth_esc=$(echo "$lava_auth" | sed -e 's/[\/&]/\\&/g')

    sed -i "s/host: \"127.0.0.1\"/host: \"$lava_host_esc\"/g" config.js
    sed -i "s/port: 2333/port: $lava_port/g" config.js
    sed -i "s/authorization: \"youshallnotpass\"/authorization: \"$lava_auth_esc\"/g" config.js
    sed -i "s/secure: false/secure: $lava_secure/g" config.js
    echo "✅ Setup thông số xong hoàn toàn!"

else
    echo "🟢 Đã tìm thấy tệp config.js, bỏ qua quá trình nhập thông số Server..."
    echo "   (Nếu bạn muốn cấu hình lại hãy dùng lệnh ./run.sh)"
fi

# ==========================================
# 4. CHẠY DOCKER LẦN ĐẦU
# ==========================================
echo "🛑 Đang dọn dẹp các container cũ (nếu có)..."
sudo docker compose down --remove-orphans 2>/dev/null || true

echo "⚙️  Đang build image từ mã nguồn mới..."
if ! sudo docker compose build --no-cache discordmusicbot; then
    echo "❌ Build thất bại!"
    exit 1
fi

echo "🚀 Đang khởi động Bot..."
if ! sudo docker compose up -d; then
    echo "❌ Khởi động thất bại!"
    exit 1
fi

echo "========================================================"
echo "✅ HOÀN TẤT SETUP LẦN ĐẦU! BOT ĐÃ CHẠY CÙNG DOCKER."
echo "🔗 Dùng lệnh './run.sh' để quay lại bảng điều khiển."
echo "🔗 Đang mở nhật ký hoạt động (Log)..."
echo "   (Ấn Ctrl + C để thoát khỏi màn hình Log)"
echo "========================================================"

sudo docker compose logs -f discordmusicbot
