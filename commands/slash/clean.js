const { t } = require("../../util/i18n");
const SlashCommand = require("../../lib/SlashCommand");

const command = new SlashCommand()
  .setName("clean")
  .setDescription(t("clean.auto_37"))
  .addIntegerOption(option =>
    option
      .setName("number")
      .setDescription(t("clean.auto_38"))
      .setMinValue(2)
      .setMaxValue(1000)
      .setRequired(false)
  )
  .setRun(async (client, interaction, options) => {
    await interaction.deferReply({ ephemeral: true });

    const limit = options.getInteger("number") || 100;

    // Lấy ID tin nhắn "Now Playing" để bảo vệ
    let nowPlayingId = null;
    if (client.manager) {
      const player = client.manager.getPlayer(interaction.guild.id);
      if (player) {
        const npm = player.get("nowPlayingMessage");
        if (npm) nowPlayingId = npm.id;
      }
    }

    try {
      // Fetch tin nhắn theo batch 100 (API limit), gom đủ số lượng yêu cầu
      const botMessages = [];
      let lastId = null;

      while (botMessages.length < limit) {
        const fetchOptions = { limit: 100 };
        if (lastId) fetchOptions.before = lastId;

        const fetched = await interaction.channel.messages.fetch(fetchOptions);
        if (fetched.size === 0) break;

        for (const msg of fetched.values()) {
          if (msg.author.id === client.user.id && msg.id !== nowPlayingId) {
            botMessages.push(msg);
            if (botMessages.length >= limit) break;
          }
        }

        // Tin nhắn cũ nhất trong batch → dùng làm cursor cho lần sau
        lastId = [...fetched.keys()].sort().at(0);

        if (fetched.size < 100) break; // Không còn tin nhắn nữa
      }

      if (botMessages.length === 0) {
        return interaction.editReply({
          embeds: [client.Embed("Không tìm thấy tin nhắn nào của bot.")]
        });
      }

      // Tách tin nhắn gần (< 14 ngày) và cũ (>= 14 ngày)
      const TWO_WEEKS = 14 * 24 * 60 * 60 * 1000;
      const now = Date.now();
      const recent = botMessages.filter(m => now - m.createdTimestamp < TWO_WEEKS);
      const old = botMessages.filter(m => now - m.createdTimestamp >= TWO_WEEKS);

      let deleted = 0;

      // bulkDelete theo batch 100 (Discord giới hạn 100/lần)
      for (let i = 0; i < recent.length; i += 100) {
        const batch = recent.slice(i, i + 100);
        try {
          const result = await interaction.channel.bulkDelete(batch, true);
          deleted += result.size;
          // Những cái bị bỏ qua → xóa tay
          for (const msg of batch) {
            if (!result.has(msg.id)) {
              await msg.delete().catch(() => {});
              deleted++;
            }
          }
        } catch {
          for (const msg of batch) {
            await msg.delete().catch(() => {});
            deleted++;
          }
        }
      }

      // Xóa tin nhắn cũ từng cái
      for (const msg of old) {
        await msg.delete().catch(() => {});
        deleted++;
      }

      await interaction.editReply({
        embeds: [client.Embed(t("clean.auto_40", { var1: deleted }))]
      });
      setTimeout(() => interaction.deleteReply().catch(() => {}), 5000);

    } catch (err) {
      client.error(err.message);
      await interaction.editReply({
        embeds: [client.ErrorEmbed(`Lỗi: ${err.message}`)]
      });
    }
  });

module.exports = command;