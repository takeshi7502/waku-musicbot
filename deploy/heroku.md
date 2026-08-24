# Deploy bot lên Heroku

Heroku chỉ chạy Discord bot. Lavalink chạy trực tiếp trên VPS và MongoDB Atlas
lưu dữ liệu bền vững. Không chạy thêm bot khác với cùng Discord token.

## Lavalink VPS

Bot Heroku kết nối trực tiếp tới Lavalink qua:

```text
lavalink.takeshi.dev:3333
```

Không tạo Nginx proxy hoặc Certbot riêng cho Lavalink. Nginx/dashboard vẫn có
thể dùng `lavalink.takeshi.dev` ở port 80/443; port 3333 là cổng riêng của
Lavalink nên không xung đột.

Trong firewall của VPS/cloud, cho phép TCP `3333` từ Internet để Heroku có thể
kết nối. Heroku dùng outbound IP động nên không thể whitelist một IP cố định.
Giữ password Lavalink mạnh và không chia sẻ nó.

## Heroku Config Vars

Thêm các giá trị sau trong **Settings → Config Vars**:

| Name | Value |
| --- | --- |
| `DISCORD_TOKEN` | Discord bot token |
| `DISCORD_CLIENT_ID` | Discord application ID |
| `BOT_ADMIN_ID` | Discord ID của chủ bot |
| `BOT_ADMIN_GUILD_ID` | ID server chính, để deploy lệnh admin ngay (không bắt buộc) |
| `MONGODB_URI` | MongoDB Atlas URI |
| `LAVALINK_HOST` | `lavalink.takeshi.dev` |
| `LAVALINK_PASSWORD` | Password Lavalink |
| `LAVALINK_PORT` | `3333` |
| `LAVALINK_SECURE` | `false` |
| `BOT_LANGUAGE` | `vi` (không bắt buộc) |

Để nút **Cập nhật Heroku** trong `/reload` tự lấy code mới và tạo release,
thêm hai Config Var này một lần:

| Name | Value |
| --- | --- |
| `HEROKU_APP_NAME` | Tên chính xác của app Heroku, ví dụ `waku-musicbot` |
| `HEROKU_API_KEY` | API key của tài khoản Heroku có quyền với app này |

Hai biến dưới đây là tùy chọn; mặc định đã là repository và nhánh hiện tại:

| Name | Default |
| --- | --- |
| `HEROKU_REPOSITORY` | `takeshi7502/waku-musicbot` |
| `HEROKU_DEPLOY_BRANCH` | `v5` |

`HEROKU_API_KEY` có quyền tạo build/release cho app, nên chỉ đặt trong Config
Vars, không gửi cho ai và tuyệt đối không commit vào Git. Repository nguồn
phải public để Heroku tải source trực tiếp.

Không tạo hoặc upload `config.js` lên Heroku. `config.heroku.js` đọc các Config
Vars này và bắt buộc dùng MongoDB thay vì database JSON tạm.

## Deploy

1. Deploy branch `v5` trong Heroku Dashboard.
2. Trong **Resources**, để `web = 0` và `worker = 1`.
3. Heroku tự chạy `npm run deploy` ở release phase sau mỗi build, nên không
   cần mở **Run console** để đăng ký slash command nữa.
4. Sau khi đã deploy commit chứa tính năng này và đặt hai Config Var Heroku ở
   trên, dùng `/reload` → **Cập nhật Heroku**. Bot sẽ lưu bài đang phát vào
   MongoDB, yêu cầu Heroku tải commit mới nhất của nhánh `v5`, build/release,
   chạy `npm run deploy`, rồi khởi động worker mới và mở lại bài đã lưu.
5. Nếu muốn lệnh hiện ngay trong một server cụ thể, deploy lại source có
   `DEPLOY_GUILD_ID` rồi chạy trong Run Console:

   ```bash
   DEPLOY_GUILD_ID=ID_SERVER npm run guild
   ```

Global command có thể mất một lúc để Discord cập nhật. Guild command thường
hiện gần như ngay; reload Discord bằng `Ctrl + R` nếu cần.

Heroku dùng worker process `npm start`, Node.js 22.x và dyno filesystem tạm.
