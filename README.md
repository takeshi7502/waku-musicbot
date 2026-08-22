# Takeshi Lavalink Node

Nhánh `lavalink` là bộ triển khai độc lập cho một Lavalink v4 node và trang
trạng thái của node. Nó không chứa Discord bot, không cần kết nối đến bot để
chạy, và có thể được clone riêng trên VPS.

## Thành phần

```text
.
├── example.application.yml        # Mẫu cấu hình Lavalink an toàn để tham khảo
├── run.sh                         # Trình hỗ trợ cài đặt/quản lý trên Linux
├── status-plugin/                 # Plugin lưu activity phát nhạc trong RAM
└── status-dashboard/              # Web status độc lập, chỉ đọc dữ liệu Lavalink
```

`status-plugin` không lưu guild ID, requester, token voice hoặc encoded track.
Dashboard chỉ nhận metadata công khai của tối đa 50 bài gần nhất.

## Cài nhanh trên VPS

Yêu cầu: Linux, Java 21 và Node.js 18 trở lên.

```bash
git clone --branch lavalink --single-branch https://github.com/takeshi7502/waku-musicbot.git lavalink
cd lavalink
```

Đặt `Lavalink.jar` của Lavalink v4 vào thư mục hiện tại, sau đó tạo cấu hình
riêng từ mẫu:

```bash
cp example.application.yml application.yml
nano application.yml
chmod 600 application.yml
```

Luôn thay mật khẩu Lavalink, refresh token OAuth/poToken và Spotify credentials
bằng dữ liệu của bạn. Không commit `application.yml`.

### Plugin cần dùng

- `youtube-source`: cần khi phát/tìm kiếm YouTube. Cài theo cấu hình
  `application.yml` đang dùng của node.
- `LavaSrc`: chỉ cần nếu muốn đọc link Spotify/Apple Music và fallback sang
  nguồn phát khác.
- `takeshi-status-plugin`: chỉ cần cho trang status và realtime activity.

Build rồi cài status plugin:

```bash
cd ~/lavalink/status-plugin
chmod +x gradlew
./gradlew clean build
cp build/libs/takeshi-status-plugin-1.1.0.jar ~/lavalink/plugins/
```

Không để đồng thời nhiều bản `takeshi-status-plugin-*.jar` trong `plugins/`.
Khi nâng version, thay JAR cũ bằng JAR mới rồi restart Lavalink.

## Chạy Lavalink

Để kiểm tra trực tiếp:

```bash
cd ~/lavalink
java -jar Lavalink.jar
```

Với systemd, service nên chạy bằng đúng user sở hữu thư mục `~/lavalink` và
dùng cấu hình tối giản sau (đổi `takeshidev` thành user của VPS):

```ini
[Unit]
Description=Lavalink Music Node
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=takeshidev
WorkingDirectory=/home/takeshidev/lavalink
ExecStart=/usr/bin/java -jar /home/takeshidev/lavalink/Lavalink.jar
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
```

Sau khi tạo hoặc sửa unit:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now lavalink
sudo systemctl status lavalink --no-pager
```

## Status dashboard (không bắt buộc)

Dashboard chạy loopback tại `127.0.0.1:3010`; chỉ Nginx hoặc Cloudflare Tunnel
nên được phép publish nó ra ngoài.

```bash
cd ~/lavalink/status-dashboard
cp config.example.json config.json
nano config.json
chmod 600 config.json
node server.js
curl http://127.0.0.1:3010/healthz
```

`lavalink.password` trong `config.json` phải khớp `application.yml`. Xem hướng
dẫn cài service dashboard chi tiết ở
[`status-dashboard/README.md`](status-dashboard/README.md).

Activity phát nhạc được đẩy realtime từ plugin sang dashboard qua một kết nối
nội bộ. Node stats vẫn refresh chung mỗi 5 giây. Mỗi người xem chỉ mở kết nối
SSE nhẹ với dashboard, không tạo polling mới tới Lavalink.

## Mạng và bảo mật

- Bot ở máy khác: mở TCP `3333` và giới hạn firewall chỉ cho IP của bot.
- Bot cùng máy: bind Lavalink vào `127.0.0.1`, không cần mở `3333` ra internet.
- Không public `/v4/*`, `/status/activity` hay `/status/activity/stream`.
- Không commit `application.yml`, `config.json`, JAR runtime, logs hoặc token.
- Dashboard public cần đi qua reverse proxy HTTPS hoặc Cloudflare Tunnel; bản
  thân dashboard vẫn giữ loopback.

## Cập nhật

```bash
cd ~/lavalink
git pull --ff-only

cd status-plugin
./gradlew clean build
mv ../plugins/takeshi-status-plugin-1.0.0.jar ../plugins/takeshi-status-plugin-1.0.0.jar.disabled 2>/dev/null || true
cp build/libs/takeshi-status-plugin-1.1.0.jar ../plugins/

sudo systemctl restart lavalink takeshi-lavalink-status
```

Chỉ thay đổi dashboard thì không cần build/restart Lavalink:

```bash
cd ~/lavalink
git pull --ff-only
sudo systemctl restart takeshi-lavalink-status
```

## Kiểm tra lỗi

```bash
sudo systemctl status lavalink takeshi-lavalink-status --no-pager
sudo journalctl -u lavalink -n 150 --no-pager
sudo journalctl -u takeshi-lavalink-status -n 100 --no-pager
curl http://127.0.0.1:3010/healthz
```

Nếu dashboard báo plugin chưa sẵn sàng, kiểm tra JAR của `takeshi-status-plugin`
đã nằm trong `plugins/`, không bị trùng bản cũ, rồi restart Lavalink.
