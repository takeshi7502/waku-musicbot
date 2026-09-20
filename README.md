# Takeshi Lavalink Node

Nhánh `lavalink` là bộ triển khai độc lập cho một Lavalink v4 node và trang
trạng thái của node. Nó không chứa Discord bot, không cần kết nối đến bot để
chạy, và có thể được clone riêng trên VPS.

## Thành phần

```text
.
├── example.application.yml        # Mẫu cấu hình Lavalink an toàn để tham khảo
├── example.ytdlp.application.yml  # Mẫu LavaSrc + yt-dlp (mode 2)
├── run.sh                         # Trình hỗ trợ cài đặt/quản lý trên Linux
├── status-plugin/                 # Plugin lưu activity phát nhạc trong RAM
└── status-dashboard/              # Web status độc lập, chỉ đọc dữ liệu Lavalink
```

`status-plugin` không lưu guild ID, requester, token voice hoặc encoded track.
Dashboard chỉ nhận metadata công khai của tối đa 50 bài gần nhất.

## Cài nhanh trên VPS

Yêu cầu: Linux. Script sẽ tự kiểm tra và cài Java khi cần.

Không cần clone repository. Trên VPS mới, chỉ cần chạy lệnh này:

```bash
bash <(curl -fsSL "https://raw.githubusercontent.com/takeshi7502/waku-musicbot/lavalink/install.sh?cache=$(date +%s)")
```

Lệnh tạo thư mục `~/lavalink`, tải `run.sh` cùng hai mẫu cấu hình, sau đó mở
luôn trình thiết lập. Chạy lại lệnh này sẽ cập nhật ba file setup trên, nhưng
giữ nguyên `application.yml`, JAR, plugin, log và cấu hình proxy đã có.

Đầu tiên script hỏi source mode:

- `1` — giữ nguyên phương thức cũ với `youtube-source` plugin và mẫu
  `example.application.yml`.
- `2` — dùng LavaSrc + binary `yt-dlp` tải từ release, với mẫu
  `example.ytdlp.application.yml`. Mode này không tải hay bật `youtube-source`.

Script chỉ kiểm tra/cài Java khi thiếu, rồi tải `Lavalink.jar` và runtime tương
ứng với mode đã chọn. Những plugin khai báo trong `lavalink.plugins` được
Lavalink tải tự động khi khởi động. Mỗi lần vào setup, script đều hỏi port và
mật khẩu: giá trị hiện có được đặt trong `[]`, nên Enter sẽ giữ nguyên còn nhập
giá trị mới sẽ cập nhật chúng. Sau đó có thể chọn cài systemd, chạy test, xem
log, restart, dừng hoặc gỡ sạch node do script cài. Port mặc định là `3333` và
password mặc định là `takeshi.dev`.

Trong lúc setup có lựa chọn proxy SOCKS5, mặc định `N`. Nếu chọn `Y`, nhập URI
dạng `socks5://user:password@host:port`. Script kiểm tra proxy trước, lưu URI ở
`~/lavalink/.lavalink-socks5-proxy` với quyền owner-only, rồi dùng `redsocks`
để chuyển **TCP của riêng tiến trình Lavalink** qua proxy. Những lần chạy sau tự
dùng lại proxy đã lưu, không bắt nhập lại. Mục `7` nhận `on`, `off` hoặc
`replace`: `off` ngừng dùng routing proxy nhưng vẫn giữ URI; `on` dùng lại URI
đó; `replace` mới hỏi URI khác. Chọn mục `1` để áp dụng thay đổi và restart
service. Nhờ đó yt-dlp và Java đều dùng cùng IP egress; Discord UDP vẫn đi trực
tiếp. Proxy này dùng được cho cả hai mode. Không tự cài remote cipher, Docker,
Node.js hay IPv6 route planner. Luôn thay refresh token OAuth và Spotify
credentials bằng dữ liệu của bạn. Không commit `application.yml` hoặc file
`.lavalink-socks5-proxy`.

Nếu chọn mode khác với `application.yml` hiện tại, script tự backup file cũ thành
`application.yml.<mode>-backup-<timestamp>`, tạo lại cấu hình theo mode mới và
giữ nguyên port cùng password. Khi chuyển từ mode 1 sang mode 2, JAR
`youtube-source` cũ được xoá; chiều ngược lại, binary `yt-dlp` cũ được xoá.
Proxy SOCKS5 đã lưu được giữ nguyên. Thêm lại OAuth/Spotify hoặc các tuỳ chỉnh
riêng từ file backup nếu cần, rồi chọn mục `1` để restart Lavalink với mode mới.
Mục `8` trong menu service quay lại màn hình chọn mode 1/2. Khi gỡ sạch ở mục
`6`, chỉ cần xác nhận `y`; Enter hoặc bất kỳ lựa chọn khác đều huỷ thao tác.

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
