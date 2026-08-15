const fs = require('fs');
let c = fs.readFileSync('lib/DiscordMusicBot.js', 'utf8');

c = c.replace(/`\[Lavalink Notify\] Chưa set \/setlog, bỏ qua thông báo.`/g, 't("system.lavalinkNotifyNoLog")');
c = c.replace(/`\[Lavalink Notify\] Không tìm thấy kênh ID: \$\{logChannelId\}`/g, 't("system.lavalinkNotifyNoChannel", { channelId: logChannelId })');
c = c.replace(/`\[Lavalink Notify\] Lỗi: \$\{e\.message\}`/g, 't("system.lavalinkNotifyError", { error: e.message })');
c = c.replace(/`Node: \$\{node\.id\} \| Lavalink đã kết nối\. \(\$\{h\}:\$\{p\}\)`/g, 't("system.lavalinkConnected", { id: node.id, host: h, port: p })');
c = c.replace(/`🟢 \*\*Lavalink Đã Kết Nối\*\*\\n\*\*Node:\*\* \\\`\$\{node\.id\}\\\`\|\\\`\$\{h\}:\$\{p\}\\\`\|\\\`\$\{s\}\\\``/g, 't("lavalink.lavalinkConnectedNotify", { id: node.id, host: h, port: p, ssl: s })');
c = c.replace(/`Node: \$\{node\.id\} \| Nút Lavalink đang kết nối lại.`/g, 't("system.lavalinkReconnecting", { id: node.id })');
c = c.replace(/`Node: \$\{node\.id\} \| Nút Lavalink đã bị hủy.`/g, 't("system.lavalinkDestroyed", { id: node.id })');
c = c.replace(/`Node: \$\{node\.id\} \| Lavalink đã ngắt kết nối\. \(\$\{h\}:\$\{p\}\)`/g, 't("system.lavalinkDisconnected", { id: node.id, host: h, port: p })');
c = c.replace(/`⚠️ \*\*Bot vừa được cập nhật!\*\*\\nBạn dùng \\\`\/play\\\` để phát lại nhạc nhé.`/g, 't("error.botUpdated")');
c = c.replace(/`Node: \$\{node\.id\} \| Lavalink lỗi: \$\{err\.message\}`/g, 't("system.lavalinkError", { id: node.id, error: err.message })');
c = c.replace(/`⚠️ \*\*Lavalink Gặp Lỗi\*\*\\n\*\*Node:\*\* \\\`\$\{node\.id\}\\\`\|\*\*Lỗi:\*\* \\\`\$\{err\.message\}\\\``/g, 't("lavalink.lavalinkErrorNotify", { id: node.id, error: err.message })');
c = c.replace(/`Không thể tải bài hát: \\\`\$\{title\}\\\``/g, 't("error.trackErrorDesc", { title })');
c = c.replace(/`Bài hát bị kẹt: \$\{track\?\.info\?\.title \|\| "Unknown"\}`/g, 't("system.trackStuck", { title: track?.info?.title || "Unknown" })');
c = c.replace(/`Bot đã bị ngắt kết nối do không có hoạt động.`/g, 't("voice.disconnectedInactivity")');
c = c.replace(/`\[Voice Status\] Lỗi cập nhật trạng thái kênh: \$\{error\.message \|\| error\}`/g, 't("system.voiceStatusError", { error: error.message || error })');
c = c.replace(/"Sự kiện đã được tải: " \+ file\.split\("\."\)\[0\]/g, 't("system.eventLoaded", { name: file.split(".")[0] })');

// Missing from lavalink.js
const fs2 = require('fs');
let l = fs.readFileSync('commands/slash/lavalink.js', 'utf8');
l = l.replace(/`✅ \*\*Tải lại Lavalink thành công!\*\*\\n\*\*Đã kết nối:\*\* \\\`\$\{connected\}\\\` nodes\.\\n\$\{[^}]+\}`/g, 't("lavalink.reloadSuccess", { connected })');
l = l.replace(/`🔴 \*\*Lavalink Đã Ngắt Kết Nối\*\*\\n\*\*Node:\*\* \\\`\$\{node\.id\}\\\`\|\\\`\$\{h\}:\$\{p\}\\\`\|\\\`\$\{s\}\\\``/g, 't("lavalink.lavalinkDisconnectedNotify", { id: node.id, host: h, port: p, ssl: s })');
l = l.replace(/`❌ \*\*Không còn node nào hoạt động!\*\*/g, 't("lavalink.noAliveNodes")');
l = l.replace(/`✅ \*\*Node còn sống:\*\* \$\{aliveNodes\.map\(n => \\\`\$\{n\.id\}\\\`\)\.join\(", "\)\}\\n→ Players mới sẽ tự động dùng node còn sống.`/g, 't("lavalink.aliveNodes", { nodes: aliveNodes.map(n => `\`${n.id}\``).join(", ") })');
fs2.writeFileSync('commands/slash/lavalink.js', l);

fs.writeFileSync('lib/DiscordMusicBot.js', c);
console.log('Fixed lib/DiscordMusicBot.js and lavalink missing strings');
