#!/bin/bash
set -e

# Đảm bảo lệnh docker compose chạy mượt mà ngay cả trên phiên bản cũ
if ! command -v docker &> /dev/null; then
    echo "❌ Docker chưa được cài đặt!"
    exit 1
fi
if ! docker compose version &> /dev/null; then
    shopt -s expand_aliases
    alias docker compose="docker-compose"
fi

check_lavalink() {
    echo ""
    echo "=========================================="
    echo "🔍 ĐANG TÌM HIỂU THÔNG TIN MÁY CHỦ LAVALINK..."
    
    # Trích xuất thông số Lavalink trực tiếp từ config.js
    lava_host=$(grep 'host: "' config.js | head -n 1 | awk -F '"' '{print $2}' || true)
    lava_port=$(grep 'port: ' config.js | head -n 1 | awk -F ' ' '{print $2}' | tr -d ',' || true)
    lava_auth=$(grep 'authorization: "' config.js | head -n 1 | awk -F '"' '{print $2}' || true)
    lava_secure=$(grep 'secure: ' config.js | head -n 1 | awk -F ' ' '{print $2}' | tr -d ',' || true)

    if [[ "$lava_secure" == "true" ]]; then
        proto="https"
    else
        proto="http"
    fi

    echo "📡 Đang Ping: $proto://$lava_host:$lava_port"
    
    # Truy vấn API /info của Lavalink
    info_json=$(curl -m 5 -s -H "Authorization: $lava_auth" "$proto://$lava_host:$lava_port/v4/info" || echo "FAILED")
    
    if [[ "$info_json" != "FAILED" && "$info_json" == *"version"* ]]; then
        echo "✅ TRẠNG THÁI: TRỰC TUYẾN & SẴN SÀNG NHẬN BOT"
        if command -v jq &> /dev/null; then
            version=$(echo "$info_json" | jq -r '.version' | cut -d'-' -f1)
            sources=$(echo "$info_json" | jq -r '.sourceManagers | join(", ")')
            plugins=$(echo "$info_json" | jq -r '.plugins[].name' 2>/dev/null | tr '\n' ',' | sed 's/,$//')
            echo "   🔹 Phiên bản Lavalink: $version"
            echo "   🔹 Nguồn Nhạc Cung Cấp: $sources"
            echo "   🔹 Các Tiện Ích Gắn Thêm: $plugins"
        else
            echo "   (Đã ping thành công nhưng Hệ điều hành của bạn thiếu 'jq' để dịch kết quả JSON)"
        fi
        
        # Truy vấn API /stats của Lavalink
        stats_json=$(curl -m 5 -s -H "Authorization: $lava_auth" "$proto://$lava_host:$lava_port/v4/stats" || echo "FAILED")
        if [[ "$stats_json" != "FAILED" && "$stats_json" == *"players"* ]]; then
            if command -v jq &> /dev/null; then
                players=$(echo "$stats_json" | jq -r '.players')
                uptime=$(echo "$stats_json" | jq -r '.uptime')
                uptime_days=$((uptime / 86400000))
                uptime_hours=$(((uptime % 86400000) / 3600000))
                
                echo "   🔹 Máy chủ đã hoạt động liên tục: ${uptime_days} ngày, ${uptime_hours} giờ"
                echo "   🔹 Số cuộc gọi nhạc đang chạy: $players (players)"
            fi
        fi
        
    else
        echo "❌ TRẠNG THÁI: NGOẠI TUYẾN hoặc BỊ CHẶN (Không thể kết nối / Sai Auth)"
    fi
    echo "=========================================="
    echo ""
}

while true; do
    echo "========================================================"
    echo "           🎵 CHƯƠNG TRÌNH ĐIỀU KHIỂN BOT VPS 🎵        "
    echo "========================================================"
    echo "1. ⚙️  Chỉ Build (Rèn) lại Image từ Code hiện tại"
    echo "2. 📡 Kiểm tra tình trạng Máy Chủ Lavalink hiện tại"
    echo "3. 🔄 Thay đổi Máy chủ Lavalink (Chỉ sửa Config)"
    echo "4. 🛑 Tắt Bot (Stop)"
    echo "5. ♻️  Chỉ Khởi Động Lại Bot nhanh (Restart)"
    echo "6. 📋 Xem trực tiếp Màn hình Log Bot (Nhật ký lỗi)"
    echo "7. 📖 Bảng hướng dẫn nhanh"
    echo "0. ❌ Thoát (Bot vẫn chạy ngầm)"
    echo "========================================================"
    read -p "Nhập số để chọn (0-7): " choice
    
    case $choice in
        1)
            echo "🛑 Đang tháo gỡ nền tảng cũ..."
            sudo docker compose down --remove-orphans 2>/dev/null || true
            # Đảm bảo thư mục data tồn tại
            mkdir -p ./data
            # Xoá db.json cũ ở root nếu còn sót
            rm -rf ./db.json 2>/dev/null || true
            echo "⚙️  Đang rèn (Build) lại Image Docker mã nguồn..."
            sudo docker compose build --no-cache discordmusicbot
            echo "🚀 Đang kích hoạt Bot..."
            sudo docker compose up -d discordmusicbot
            check_lavalink
            echo "📋 Đang mở Nhật ký hiển thị... (Bấm Ctrl+C để thoát Nhật ký)"
            sudo docker compose logs -f discordmusicbot
            ;;
        2)
            check_lavalink
            read -p "Nhấn thao tác Enter để quay lại Menú điều khiển..."
            ;;
        3)
            echo "🔄 QUY TRÌNH THAY ĐỔI MÁY CHỦ LAVALINK"
            while true; do
                read -p "1. Máy chủ (VD: lavalink.example.com): " lava_host
                while [[ -z "$lava_host" ]]; do read -p "❌ Trống! Điền lại Máy chủ: " lava_host; done

                read -p "2. Cổng Cắm (Port) (VD: 443, 80 hoặc 2333): " lava_port
                while [[ -z "$lava_port" ]]; do read -p "❌ Trống! Điền lại Port: " lava_port; done

                read -p "3. Mật Vị Authorization (Password): " lava_auth
                while [[ -z "$lava_auth" ]]; do read -p "❌ Trống! Điền lại Authorization: " lava_auth; done

                echo "4. Lớp Bảo Mật Secure (Là HTTPS hay WSS mới có):"
                echo "   1) Chọn False (Nền HTTP)"
                echo "   2) Chọn True (Nền HTTPS)"
                read -p "   Chọn (1/2) [Enter=1]: " secure_input

                if [[ "$secure_input" == "2" ]]; then
                    lava_secure="true"
                    proto="https"
                else
                    lava_secure="false"
                    proto="http"
                fi

                echo "⏳ Đang thử đập cửa gọi Lavalink ($proto://$lava_host:$lava_port)..."
                status_code=$(curl -m 5 -s -o /dev/null -w "%{http_code}" -H "Authorization: $lava_auth" "$proto://$lava_host:$lava_port/v4/info" || echo "failed")
                
                if [[ "$status_code" == "200" ]] || [[ "$status_code" == "404" ]]; then
                    echo "✅ Xác thực Tốt! Bắt đầu tráo dòng config..."
                    break
                else
                    echo "❌ Bị trả về Mã: $status_code. Hãy chọn Port hoặc Host khác."
                fi
            done
            
            # Escape for sed
            lava_host_esc=$(echo "$lava_host" | sed -e 's/[\/&]/\\&/g')
            lava_auth_esc=$(echo "$lava_auth" | sed -e 's/[\/&]/\\&/g')
            
            sed -i "s|^.*host: .*|\t\t\thost: \"$lava_host_esc\",|g" config.js
            sed -i "s|^.*port: .*|\t\t\tport: $lava_port,|g" config.js
            sed -i "s|^.*authorization: .*|\t\t\tauthorization: \"$lava_auth_esc\",|g" config.js
            sed -i "s|^.*secure: .*|\t\t\tsecure: $lava_secure,|g" config.js
            echo ""
            echo "✅ Đã ghi cấu hình Lavalink mới vào config.js thành công!"
            echo "👉 Bây giờ sếp vào Discord gõ lệnh /reload để Bot nạp lại cấu hình mới nhé!"
            echo ""
            read -p "Nhấn Enter để quay lại Menu..."
            ;;
        4)
            echo "🛑 Đang cắt điện toàn bộ hệ thống Bot..."
            sudo docker compose down
            echo "✅ Gỡ trạm thành công!"
            ;;
        5)
            echo "♻️  Đang Reboot nóng cho Bot..."
            sudo docker compose restart discordmusicbot
            echo "✅ Kích xong!"
            ;;
        6)
            echo "📋 Đang theo dõi cửa sổ Nhật ký (Logs)..."
            echo "   (Ấn Ctrl + C để ngừng theo dõi)"
            sudo docker compose logs -f discordmusicbot
            ;;
        7)
            echo ""
            echo "╔══════════════════════════════════════════════════════════╗"
            echo "║           📖 BẢNG HƯỚNG DẪN CẬP NHẬT NHANH            ║"
            echo "╠══════════════════════════════════════════════════════════╣"
            echo "║ Thay đổi gì?              │ Cần làm gì?                ║"
            echo "╠═══════════════════════════╪════════════════════════════ ╣"
            echo "║ Sửa code lệnh, logic,     │ /reload trong Discord      ║"
            echo "║ events, lib               │                            ║"
            echo "╠═══════════════════════════╪════════════════════════════ ╣"
            echo "║ Sửa config.js             │ /reload hoặc /lavalink     ║"
            echo "║ (Lavalink, adminId...)     │                            ║"
            echo "╠═══════════════════════════╪════════════════════════════ ╣"
            echo "║ Thêm file lệnh .js mới    │ Restart Docker (Mục 5)     ║"
            echo "╠═══════════════════════════╪════════════════════════════ ╣"
            echo "║ Cài thêm thư viện npm     │ Rebuild Docker (Mục 1)     ║"
            echo "║ (npm install xyz)         │                            ║"
            echo "╠═══════════════════════════╪════════════════════════════ ╣"
            echo "║ Sửa Dockerfile,           │ Rebuild Docker (Mục 1)     ║"
            echo "║ package.json              │                            ║"
            echo "╚══════════════════════════════════════════════════════════╝"
            echo ""
            read -p "Nhấn Enter để quay lại Menu..."
            ;;
        0)
            echo "👋 Thoát! Bot vẫn đang tự chạy đằng sau."
            exit 0
            ;;
        *)
            echo "❌ Bạn nhập sai số, mời bấm lại."
            ;;
    esac
done
