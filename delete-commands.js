const { REST, Routes } = require('discord.js');
const config = require('./config');

const rest = new REST({ version: '10' }).setToken(config.token);

(async () => {
    try {
        console.log('Đang bắt đầu xóa tất cả lệnh slash...');

        // 1. XÓA LỆNH TRÊN SERVER CỤ THỂ (Guild)
        // Dùng khi bạn đang thử nghiệm trên 1 server và lỡ tay đăng ký lệnh guild
        if (config.adminGuildId) {
            await rest.put(
                Routes.applicationGuildCommands(config.clientId, config.adminGuildId),
                { body: [] },
            );
            console.log(`✅ Đã xóa thành công tất cả lệnh trên Server ID: ${config.adminGuildId}`);
        }

        // 2. XÓA LỆNH TOÀN CỤC (Global)
        // Dùng khi bạn muốn xóa hết lệnh hiện có trên mọi máy chủ
        await rest.put(
            Routes.applicationCommands(config.clientId),
            { body: [] },
        );
        console.log('✅ Đã xóa thành công tất cả lệnh Toàn Cục (Global).');

    } catch (error) {
        console.error('Đã xảy ra lỗi khi xóa lệnh:', error);
    }
})();
