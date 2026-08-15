<h1 align="center"><img src="./assets/logo.gif" width="30px"> Discord Music Bot <img src="./assets/logo.gif" width="30px"></h1>

## ✨ Cập Nhật Mới Nhất (Bản Fork Tùy Biến)

Đây là phiên bản fork đã được tùy chỉnh từ dự án gốc, mang lại sự tương thích tốt nhất với hệ thống Lavalink v4.

### Các Thay Đổi Trong Phiên Bản Này:
 - **Hỗ Trợ Lavalink v4:** Đã chuyển từ thư viện `erela.js` (Lavalink v3) sang `lavalink-client` v4.
 - **Vượt Tường Lửa YouTube:** Tích hợp bộ cấu hình `yt-dlp` để vượt qua lỗi chặn IP của YouTube.
 - **Cập Nhật Voice Channel Status:** Tự động hiển thị tên bài hát đang phát lên trạng thái của Kênh Thoại.
 - **Tối Ưu Thông Báo:** Cải thiện và gộp chung thông báo điều khiển nhạc để kênh chat gọn gàng hơn.
 - **Trình Quản Lý `run.sh`:** Chứa lệnh tự động giúp bạn cài đặt Docker và quản lý toàn bộ bot một cách dễ dàng.
 - Bảng Điều Khiển (Dashboard) trên Website.
 - Database nội bộ để lưu trữ danh sách bài hát yêu thích.

## 🚧 | Yêu Cầu Hệ Thống

- [Node.js 16+](https://nodejs.org/en/download/)
- [Lavalink Server v4.x.x](https://github.com/lavalink-devs/Lavalink)
- Bạn cần chạy lệnh `npm run deploy` hoặc `yarn deploy` máy tính để tải dữ liệu lệnh Slash lên Discord.

> **LƯU Ý:** Bot này dùng Lavalink để phát nhạc. Bắt buộc bạn phải chuẩn bị 1 Server Lavalink đang hoạt động (hỗ trợ bản v4.x).

## 📝 | Tự Động Deploy Bot Lên VPS Ubuntu (Khuyên Dùng Docker)

Dự án này đã được trang bị công cụ `run.sh` giúp bạn cài đặt tự động.

1. Clone bộ code này về máy chủ VPS của bạn:
```sh
git clone https://github.com/takeshi7502/Discord-MusicBot.git musicbot/ && cd musicbot
```
2. Mở file thư mục `config.js` để chỉnh sửa Token Bot và thiết lập kết nối Lavalink:
```sh
nano config.js
```
*Lưu ý: Nếu bạn sử dụng tính năng nghe nhạc YouTube qua Proxy / yt-dlp, hãy cấu hình file `application.yml` trong mục `Lavalink/`.*

3. Khởi chạy Trình Quản Trị Console:
```sh
bash run.sh
```
Từ bảng điều khiển này, bạn có thể Tự động cài đặt Docker, Build mã nguồn, Chạy Bot, và Xem Logs hoạt động.

### 💪🏻 Cài Đặt Trực Tiếp (Không Dùng Docker)
> Nhớ hãy điền đầy đủ mọi thông tin cấu hình Lavalink trong `config.js` trước.

Cài đặt thư viện và đăng ký Slash Commands:
```sh
npm install
npm run deploy
```
Chạy Bot:
```sh
node index.js
```

## 📝 | [Nhóm Trợ Giúp (Support Server)](https://discord.gg/sbySMS7m3v)

Nếu bạn gặp khó khăn hay lỗi xuất hiện trong quá trình thiết lập bot, hãy tham gia server hỗ trợ để hỏi đáp.

## 🙏 | Lời Cảm Ơn (Credits)

- **Tác Giả Gốc:** [SudhanPlayz](https://github.com/SudhanPlayz)
- **Repository Gốc:** [SudhanPlayz/Discord-MusicBot](https://github.com/SudhanPlayz/Discord-MusicBot)

Phiên bản Fork này hoạt động độc lập nhằm mục đích nâng cấp cấu trúc lên hệ điều hành Lavalink v4 hiện đại.

## ✨ | Những Người Đóng Góp Cho Original Repo

Những đóng góp luôn được đón nhận nồng nhiệt :D Vui lòng xem [Contributing.md](/CONTRIBUTING.md)

<a href="https://github.com/SudhanPlayz/Discord-MusicBot/graphs/contributors">
  <img src="https://contributors-img.web.app/image?repo=SudhanPlayz/Discord-MusicBot" />
</a>

## 🌟 | Các Công Nghệ Được Sử Dụng

- [Discord.js](https://discord.js.org/)
- **[Lavalink-Client](https://github.com/EmberGalaxy/lavalink-client)** (Thay thế cho erela.js)
- [Lavalink v4](https://github.com/lavalink-devs/Lavalink) 
- [Express](https://expressjs.com/)
- [Next JS](https://nextjs.org/)
- [Next UI](https://nextui.org)
- [Material UI Icons](https://mui.com/material-ui/material-icons/)
