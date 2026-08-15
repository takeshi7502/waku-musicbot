const fs = require('fs');
const path = require('path');

// Bản đồ từ string gốc (chữ Việt Nam chính xác) sang t("key")
// Mảng [Regex hoặc String, key t()]
const exactReplacements = [
  ['"Bạn phải ở trong một kênh thoại để sử dụng lệnh này!"', 't("common.noVoiceChannel")'],
  ['"Bạn phải ở trong cùng một kênh thoại với tôi để sử dụng lệnh này!"', 't("common.sameVoiceChannel")'],
  ['"Tôi không có đủ quyền để tham gia vào kênh thoại của bạn!"', 't("common.noPermissionJoin")'],
  ['"Bạn không có quyền sử dụng lệnh này!"', 't("common.noPermission")'],
  ['"❌ | **Không có người chơi để kiểm soát trong máy chủ này.**"', 't("common.noPlayer")'],
  ['"❌ | **Bạn phải ở trong một kênh thoại để sử dụng hành động này!**"', 't("common.noPlayerVoice")'],
  ['"❌ | **Bạn phải ở trong cùng một kênh thoại với bot để sử dụng lệnh này!**"', 't("common.sameVoiceRequired")'],
  ['"Nút Lavalink không được kết nối"', 't("common.noLavalink")'],
  ['"Không có bài hát nào đang phát."', 't("common.noSongPlaying")'],
  ['"Hiện tại không có bài hát nào đang được phát."', 't("common.noCurrentSong")'],
  ['"❌ | **Lựa chọn điều khiển không rõ**"', 't("common.unknownControl")'],
  ['"Xin lỗi, lệnh bạn đã sử dụng không có bất kỳ chức năng thực thi nào"', 't("common.unknownCommand")'],
  ['"Xin lỗi, lệnh bạn vừa sử dụng không có bất kỳ chức năng thực thi nào"', 't("common.unknownContextCommand")'],
  
  // Của events/system
  ['"Đã bắt đầu bot..."', 't("system.botStarted")'],
  ['"Chế độ gỡ lỗi đã được kích hoạt!"', 't("system.debugEnabled")'],
  ['"Chỉ kích hoạt điều này nếu bạn biết bạn đang làm gì!"', 't("system.debugWarning")'],
  ['"Không có bài hát trước đó được phát."', 't("player.noPreviousSong")'],
  ['"Không có bài hát trước đó cho phiên này."', 't("player.noPreviousSession")'],
  ['"Không có bài hát trước đó trong hàng đợi."', 't("player.noPreviousQueue")'],
  ['"⏹️ | Đã dừng trình phát nhạc"', 't("player.stoppedAuthor")'],
  ['"⏸ | **Đã Dừng**"', 't("player.paused")'],
  ['"⏯ **Đã tiếp tục phát!**"', 't("player.resumed")'],
  ['"Bài hát đang phát hiện tại đã được tạm dừng rồi!"', 't("player.alreadyPaused")'],
  ['"Bài hát hiện tại đã được tiếp tục phát rồi"', 't("player.alreadyResumed")'],
  ['"✅ | **Đã bỏ qua!**"', 't("player.skipped")'],
  ['"Không có gì để bỏ qua."', 't("player.nothingToSkip")'],
  ['"Tôi không đang phát bất kỳ bài hát nào."', 't("player.notPlaying")'],
  ['"Bot không ở trong một kênh thoại."', 't("player.notInChannel")'],
  ['"Tôi không ở trong một kênh."', 't("player.notInChannelSkipto")'],
  ['"🔀 | **Đã hoàn thành việc trộn ngẫu nhiên hàng đợi.**"', 't("player.shuffled")'],
  ['"Không đủ bài hát trong hàng đợi."', 't("player.notEnoughSongs")'],
  ['"Không có bản nhạc đang phát."', 't("player.noTracksPlaying")'],
  ['"👍 | **Lặp đã được kích hoạt / tắt**"', 't("player.loopEnabled")'],
  ['"Lặp lại hàng đợi bài hát hiện tại"', 't("player.loopQueueEnabled")'],
  ['"Không có bài hát nào trong hàng đợi."', 't("player.noSongsInQueue")'],
  ['":white_check_mark: | **Đã di chuyển bài hát**"', 't("player.moved")'],
  ['"Không có bài hát để xóa."', 't("player.noSongToRemove")'],
  ['"✅ | Đã bỏ qua đến vị trí chỉ định"', 't("player.skippedTo")'],
  ['"❌ | Vị trí không hợp lệ!"', 't("player.invalidPosition")'],

  // Queue
  ['"Hàng đợi đã kết thúc"', 't("queue.ended")'],
  ['"Không có bài hát nào trong hàng đợi để xóa."', 't("queue.nothingToClear")'],
  ['"Không có tin nhắn nào của Bot để xoá."', 't("queue.noMessagesToClean")'],

  // Voice
  ['"Tạm Dừng!"', 't("voice.paused")'],
  ['"Tiếp Tục!"', 't("voice.resumed")'],
  ['"Bản nhạc hiện tại đã bị tạm dừng vì không có ai trong kênh thoại."', 't("voice.pausedReason")'],
  ['"Bản nhạc hiện tại đã được tiếp tục"', 't("voice.resumedReason")'],
  ['"Đã ngắt kết nối!"', 't("voice.disconnected")'],
  ['"Bot đã bị ngắt kết nối do không có hoạt động."', 't("voice.disconnectedInactivity")'],
  ['"Rời đi vì không còn ai ở trong kênh thoại."', 't("voice.disconnectedNoMembers")'],

  // Error
  ['"Lỗi phát nhạc!"', 't("error.trackErrorTitle")'],
  ['"Oops! Có điều gì đó đã xảy ra không đúng, nhưng không phải lỗi của bạn!"', 't("error.trackErrorFooter")'],
  ['"Lỗi bài hát!"', 't("error.trackStuckTitle")'],
  ['"Ồ! Có điều gì đó đã xảy ra không đúng nhưng không phải lỗi của bạn!"', 't("error.trackStuckFooter")'],
  ['"❌ Có lỗi xảy ra khi thực hiện lệnh."', 't("error.generic")'],

  // Misc
  ['"Đang phát"', 't("player.nowPlaying")'],
  ['"Yêu cầu từ"', 't("player.requestedBy")'],
  ['"Thời lượng"', 't("player.duration")'],
  ['"Không có mô tả"', 't("player.noDescription")'],
  ['"🔎 | **Đang tìm...**"', 't("lyrics.searching")'],
  ['":mag_right: **Đang tìm...**"', 't("player.searching")'],
  ['"Có lỗi xảy ra trong quá trình tìm kiếm"', 't("player.searchError")'],
  ['"Vui lòng nhập tên bài hát hoặc link!"', 't("player.noQueryProvided")'],
  ['"Không tìm thấy kết quả nào"', 't("player.noResults")'],
  
  ['"Không có nhạc đang phát."', 't("filters.noMusicPlaying")'],
  ['"✅ | Bộ lọc Nightcore hiện đang hoạt động!"', 't("filters.nightcore")'],
  ['"✅ | Bộ lọc BassBoost hiện đang được kích hoạt!"', 't("filters.bassboost")'],
  ['"✅ | Bộ lọc Vaporwave hiện đang được kích hoạt!"', 't("filters.vaporwave")'],
  ['"✅ | Bộ lọc Pop hiện đang được kích hoạt!"', 't("filters.pop")'],
  ['"✅ | Bộ lọc Soft hiện đang được kích hoạt!"', 't("filters.soft")'],
  ['"✅ | Bộ lọc Treblebass hiện đang được kích hoạt!"', 't("filters.treblebass")'],
  ['"✅ | Bộ lọc Eight Dimension hiện đang được kích hoạt!"', 't("filters.eightDimension")'],
  ['"✅ | Bộ lọc Karaoke hiện đang được kích hoạt!"', 't("filters.karaoke")'],
  ['"✅ | Bộ lọc Vibrato hiện đang được kích hoạt!"', 't("filters.vibrato")'],
  ['"✅ | Bộ lọc Tremolo hiện đang được kích hoạt!"', 't("filters.tremolo")'],
  ['"✅ | EQ đã được xóa!"', 't("filters.eqCleared")'],
  ['"❌ | Bộ lọc không hợp lệ!"', 't("filters.invalidFilter")'],

  ['"**Rất tiếc, chúng tôi không được ủy quyền để hiển thị lời bài hát này.**"', 't("lyrics.notAuthorized")'],
  ['"Mẹo Lấy Lời Bài Hát"', 't("lyrics.tip")'],

  ['"Có lỗi xảy ra khi tìm kiếm bài hát"', 't("search.searchError")'],

  ['"Không có lệnh tác vụ ẩn nào."', 't("cmd.noHiddenCommands")'],
  ['"Bạn không được ủy quyền để sử dụng lệnh này!"', 't("cmd.noPermission")'],
];

const regexReplacements = [
  // 247.js
  { 
      regex: /`✅ \| Chế độ \*\*24\/7\*\* đã được \*\*bật\*\*! Bot sẽ luôn ở trong kênh thoại.`/g, 
      replace: 't("toggle.247.enabled")' 
  },
  { 
      regex: /`✅ \| Chế độ \*\*24\/7\*\* đã được \*\*tắt\*\*! Bot sẽ rời kênh thoại khi không ai nghe.`/g, 
      replace: 't("toggle.247.disabled")' 
  },
  { 
      regex: /`✅ \| Chế độ \*\*Tự động rời\*\* đã được \*\*bật\*\*! Bot sẽ rời khi không ai trong kênh.`/g, 
      replace: 't("toggle.autoleave.enabled")' 
  },
  { 
      regex: /`✅ \| Chế độ \*\*Tự động rời\*\* đã được \*\*tắt\*\*!`/g, 
      replace: 't("toggle.autoleave.disabled")' 
  },
  { 
      regex: /`✅ \| Chế độ \*\*Tự động tạm dừng\*\* đã được \*\*bật\*\*!`/g, 
      replace: 't("toggle.autopause.enabled")' 
  },
  { 
      regex: /`✅ \| Chế độ \*\*Tự động tạm dừng\*\* đã được \*\*tắt\*\*!`/g, 
      replace: 't("toggle.autopause.disabled")' 
  },
  { 
      regex: /`✅ \| Chế độ \*\*Tự động hàng đợi\*\* đã được \*\*bật\*\*! Bài hát liên quan sẽ tự thêm vào.`/g, 
      replace: 't("toggle.autoqueue.enabled")' 
  },
  { 
      regex: /`✅ \| Chế độ \*\*Tự động hàng đợi\*\* đã được \*\*tắt\*\*!`/g, 
      replace: 't("toggle.autoqueue.disabled")' 
  },
  {
      regex: /`Không có người chơi hoạt động\. Dùng \/play trước!`/g,
      replace: 't("toggle.247.noPlayer")'
  },
  {
      regex: /"Bạn không có đặc quyền để quy hoạch tính năng nội bộ này!"/g,
      replace: 't("setlog.noPermission")'
  },
  {
      regex: /"✅ \| Đã quy hoạch trạm tình báo! Từ nay mỗi khi Bot chui vào Server lạ hoặc bị sút khỏi Server nào, nó sẽ báo về kênh <#\$\{channel\.id\}> cho mình!"/g,
      replace: 't("setlog.success", { channel: channel.id })'
  },
  {
      regex: /"Bạn cần quyền Quản Lý Máy Chủ \(Manage Guild\) để chạy lệnh này!"/g,
      replace: 't("setup.noPermission")'
  },
  {
      regex: /"✅ \| Kênh nhận thông báo cập nhật đã được thiết lập thành <#\$\{channel\.id\}>"/g,
      replace: 't("setup.success", { channel: channel.id })'
  },
  {
      regex: /`✅ \| \*\*Đã xóa tất cả \$\{count\} bài trong hàng đợi!\*\*`/g,
      replace: 't("queue.cleared", { count })'
  },
  {
      regex: /`✅ \| \*\*Đã xoá \$\{count\} tin nhắn trước đó của Bot trong kênh này!\*\*`/g,
      replace: 't("queue.cleaned", { count })'
  },
  {
      regex: /`Đã xóa bài hát số \*\*\$\{number\}\*\* khỏi hàng đợi\.`/g,
      replace: 't("player.removed", { number })'
  },
  {
      regex: /`Không có gì sau \[.*\]\(.*\) trong hàng đợi\.`/g,
      replace: 't("player.nothingAfterSkip", { title: song.info.title, url: song.info.uri })'
  },
  {
      regex: /`Phát lại \[.*\]\(.*\)`/g,
      replace: 't("player.replay", { title: song.info.title, url: song.info.uri })'
  },
  {
      regex: /`Không tìm thấy kết quả cho .*`/g,
      replace: 't("search.noResultsFor", { query })'
  },
  {
      regex: /`Đây không phải lệnh của bạn!`/g,
      replace: 't("lavalink.notYourCommand")'
  },
  {
      regex: /"Bạn không có đặc quyền để sử dụng hệ thống phóng thanh tột đỉnh này!"/g,
      replace: 't("broadcast.noPermission")'
  },
  {
      regex: /`❌ Không tìm thấy Server nào có ID: .*`/g,
      replace: 't("broadcast.serverNotFound", { id: guildId })'
  },
  {
      regex: /"❌ Bạn không được ủy quyền để sử dụng lệnh này!"/g,
      replace: 't("guildleave.noPermission")'
  },
  {
      regex: /"Không có máy chủ nào\."/g,
      replace: 't("guildleave.noGuilds")'
  },
  {
      regex: /`📋 Danh sách máy chủ \(\$\{client\.guilds\.cache\.size\}\)`/g,
      replace: 't("guildleave.guildList", { count: client.guilds.cache.size })'
  },
  {
      regex: /"⚠️ XÁC NHẬN RỜI TOÀN BỘ MÁY CHỦ"/g,
      replace: 't("guildleave.confirmLeaveAll")'
  },
  {
      regex: /"✅ Đã huỷ\. Bot không rời khỏi máy chủ nào\."/g,
      replace: 't("guildleave.cancelled")'
  },
  {
      regex: /`⏳ Đang rời khỏi \$\{guilds\.length\} máy chủ\.\.\.`/g,
      replace: 't("guildleave.leavingAll", { count: guilds.length })'
  },
  {
      regex: /`🚪 Hoàn tất rời máy chủ`/g,
      replace: 't("guildleave.leaveComplete")'
  },
  {
      regex: /`⏰ Hết thời gian xác nhận\. Đã huỷ thao tác\."`/g,
      replace: 't("guildleave.timeout")'
  },
  {
      regex: /`✅ Đã rời khỏi máy chủ \*\*\$\{guild\.name\}\*\* \(\`\$\{id\}\`\)`/g,
      replace: 't("guildleave.leftGuild", { name: guild.name, id })'
  },
  {
      regex: /`👋 Tạm biệt nha! \(Đã dừng bởi <@\$\{interaction\.user\.id\}>\)`/g,
      replace: 't("player.stopped", { user: `<@${interaction.user.id}>` })'
  },
  {
      regex: /`Đang phát  \[\$\{ player\.queue\.current\.info\.title \}\]\(\$\{ player\.queue\.current\.info\.uri \}\)`/g,
      replace: 't("voice.currentlyPlaying", { title: player.queue.current.info.title, url: player.queue.current.info.uri })'
  },
  {
      regex: /`Đã ngắt kết nối từ <#\$\{oldChannel\}>`/g,
      replace: 't("queue.disconnectedFromChannel", { channel: oldChannel })'
  },
  {
      regex: /"Có lỗi xảy ra trong quá trình tìm kiếm"/g,
      replace: 't("player.searchError")'
  },
  {
      regex: /"Mời tớ vào máy chủ của bạn!"/g,
      replace: 't("invite.desc")'
  },
  {
      regex: /`Chỉ có \*\*\$\{interaction\.user\.tag\}\*\* mới có thể sử dụng nút này\.`/g,
      replace: 't("player.onlyUserCanUse", { user: interaction.user.tag })'
  },
  {
      regex: /`\*\*(Đã thêm Playlist|Đã thêm):.*`/g,
      replace: 't("player.added", { title: track.info.title, url: track.info.uri, user: typeof track.requester === "object" ? `<@${track.requester.id}>` : `<@${track.requester}>`, duration: formatTime(track.info.duration) })'
  }
];

const dirs = [
    'commands/slash', 
    'commands/context', 
    'events', 
    'util', 
    'lib'
];

dirs.forEach(dir => {
    const fullDir = path.join(__dirname, dir);
    if (!fs.existsSync(fullDir)) return;
    
    fs.readdirSync(fullDir).filter(f => f.endsWith('.js')).forEach(f => {
        const filePath = path.join(fullDir, f);
        let content = fs.readFileSync(filePath, 'utf8');
        let originalContent = content;

        // Apply exact replacements
        exactReplacements.forEach(([search, replace]) => {
            content = content.replace(new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), replace);
        });

        // Apply regex replacements
        regexReplacements.forEach(({regex, replace}) => {
            content = content.replace(regex, replace);
        });

        if (content !== originalContent) {
            // Need to insert import if missing
            if (!content.includes('const { t } = require(') && !content.includes('const { t, setLanguage } = require(')) {
                let requirePath = '';
                if (dir.startsWith('commands/') || dir === 'events') requirePath = '../util/i18n';
                else if (dir === 'util') requirePath = './i18n';
                else if (dir === 'lib') requirePath = '../util/i18n';
                else requirePath = '../util/i18n';

                if (dir.includes('/')) requirePath = '../../util/i18n';

                // insert after the first line of requires
                const requireStr = `const { t } = require("${requirePath}");\n`;
                
                // Tránh lỗi chèn giữa dòng
                if (content.includes('const { EmbedBuilder')) {
                     content = content.replace(/const \{ EmbedBuilder[^\n]+;/g, match => `${match}\n${requireStr}`);
                } else {
                     content = requireStr + content;
                }
            }
            fs.writeFileSync(filePath, content);
            console.log(`Updated ${dir}/${f}`);
        }
    });
});
