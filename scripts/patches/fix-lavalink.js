const fs = require('fs');
let c = fs.readFileSync('commands/slash/lavalink.js', 'utf8');

c = c.replace(/"❌ Cần nhập đầy đủ: `host`, `port`, `password`"/g, 't("lavalink.requiredFields")');
c = c.replace(/"❌ Không có node nào trong config!"/g, 't("lavalink.noNodes")');
c = c.replace(/`🔍 Đang ping \\\`http\$\{secure \? 's' : ''\}:\/\/\$\{host\}:\$\{port\}\\\`...`/g, 't("lavalink.pinging", { url: `http${secure ? "s" : ""}://${host}:${port}` })');
c = c.replace(/`❌ Đã đạt giới hạn \*\*\$\{MAX_NODES\} nodes\*\*!`/g, 't("lavalink.maxNodes", { max: MAX_NODES })');
c = c.replace(/`❌ Không tìm được slot ID trống!`/g, 't("lavalink.noSlotAvailable")');
c = c.replace(/`❌ Lỗi: \\\`\$\{err\.message\}\\\``/g, 't("lavalink.errorGeneric", { error: err.message })');
c = c.replace(/`❌ Lỗi: \\\`\$\{e\.message\}\\\``/g, 't("lavalink.errorGeneric", { error: e.message })');
c = c.replace(/`🔍 Đang test \\\`\$\{host\}:\$\{port\}\\\` trước khi thêm...`/g, 't("lavalink.testingBeforeAdd", { host, port })');
c = c.replace(/"❌ Cần nhập \`idnode\` \(VD: node1, node2\)"/g, 't("lavalink.requiredIdnode")');
c = c.replace(/"❌ Không thể xoá \*\*node0\*\*! Đây là node chính, luôn phải tồn tại."/g, 't("lavalink.cannotRemoveNode0")');
c = c.replace(/`⚠️ \*\*Bot vừa được cập nhật!\*\*\\nBạn dùng \\\`\/play\\\` để phát lại nhạc nhé.`/g, 't("error.botUpdated")');
c = c.replace(/"❌ Cần nhập \`idnode\` — ID node cần thay thế \(VD: node1, node2\)"/g, 't("lavalink.requiredIdnodeReplace")');
c = c.replace(/"❌ Cần nhập đầy đủ: `host`, `port`, `password` cho node thay thế"/g, 't("lavalink.requiredFieldsReplace")');
c = c.replace(/`🔍 Đang test node mới \\\`\$\{host\}:\$\{port\}\\\` trước khi thay thế \\\`\$\{oldNode\.id\}\\\`...`/g, 't("lavalink.testingBeforeReplace", { host, port, id: oldNode.id })');
c = c.replace(/`⚠️ \*\*Server nhạc đang được thay thế!\*\*\\nBạn dùng \\\`\/play\\\` để phát lại nhạc nhé.`/g, 't("error.serverReplaced")');
c = c.replace(/`♻️ \*\*Đang tải lại cấu hình Lavalink\.\.\.\*\*\\n\$\{changeMsg\}`/g, 't("lavalink.reloadingConfig", { changes: changeMsg })');
c = c.replace(/"⚠️ \*\*Lavalink vừa được cập nhật cấu hình!\*\*\\nBạn dùng `\/play` để phát lại nhạc nhé."/g, 't("error.lavalinkUpdated")');
c = c.replace(/`❌ Lỗi Reload Lavalink: \\\`\$\{e\.message\}\\\``/g, 't("lavalink.reloadError", { error: e.message })');

if (!c.includes('const { t } =') && !c.includes('const { t, setLanguage } =')) {
    c = c.replace('const { EmbedBuilder } = require("discord.js");', 'const { EmbedBuilder } = require("discord.js");\nconst { t } = require("../../util/i18n");');
}

fs.writeFileSync('commands/slash/lavalink.js', c);
console.log('Fixed lavalink.js');
