const SlashCommand = require("../../lib/SlashCommand");
const {
  EmbedBuilder,
  ChannelType
} = require("discord.js");
const {
  t
} = require("../../util/i18n");
const command = new SlashCommand().setName("broadcast").setDescription(t("broadcast.auto_21")).setAdminOnly(true).addStringOption(option => option.setName("message").setDescription(t("broadcast.auto_22")).setRequired(true)).addStringOption(option => option.setName("target").setDescription(t("broadcast.auto_23")).setRequired(false)).setRun(async (client, interaction, options) => {
  // Tránh việc lệnh chạy quá lâu bị timeout
  await interaction.deferReply({
    ephemeral: true
  }).catch(() => {});

  // Kiểm tra quyền: Chỉ tài khoản Admin gốc mớii xài được lệnh này
  if (interaction.user.id !== client.config.adminId) {
    return interaction.editReply({
      embeds: [client.ErrorEmbed(t("broadcast.noPermission"))]
    }).catch(() => {});
  }
  let messageContent = options.getString("message");
  let targetOpt = options.getString("target");

  // Hỗ trợ gõ \n để xuống dòng trong Embed
  messageContent = messageContent.replace(/\\n/g, "\n");

  // Nếu nhập có khoảng trắng ở đầu đuôi thì cắt đi
  if (targetOpt) targetOpt = targetOpt.trim();
  const targetMode = targetOpt?.toLowerCase();
  const guildsToProcess = new Map();
  const missingGuildIds = [];
  if (!targetOpt || targetOpt === "." || targetMode === "here") {
    // Trường hợp 1: Không tải target hoặc gõ "." -> Chỉ gửi ở Server hiện tại (Để Test)
    const guild = client.guilds.cache.get(interaction.guildId);
    if (guild) guildsToProcess.set(guild.id, guild);
  } else if (targetMode === "all") {
    // Trường hợp 3: Nhập "all" -> Gửi toàn bộ server
    client.guilds.cache.forEach((guild, id) => guildsToProcess.set(id, guild));
  } else {
    // Trường hợp 2: Có ID Server cụ thể -> Chỉ móc đúng Server đó ra
    const targetIds = [...new Set(targetOpt.split(",").map(id => id.trim()).filter(Boolean))];
    for (const id of targetIds) {
      const guild = client.guilds.cache.get(id);
      if (guild) guildsToProcess.set(guild.id, guild);else missingGuildIds.push(id);
    }
    if (guildsToProcess.size === 0) {
      return interaction.editReply({
        embeds: [client.ErrorEmbed(t("broadcast.serverNotFound", {
          id: missingGuildIds.join(", ") || targetOpt
        }))]
      }).catch(() => {});
    }
  }
  let successCount = 0;
  let fallbackCount = 0;
  let failCount = missingGuildIds.length;
  const totalTargets = guildsToProcess.size + missingGuildIds.length;
  const createStatusEmbed = isComplete => {
    const successfulTargets = successCount + fallbackCount;
    return new EmbedBuilder().setColor(isComplete ? "#00FF00" : "#FEE75C").setAuthor({
      name: isComplete ? t("broadcast.auto_28") : t("broadcast.inProgressTitle")
    }).setDescription(isComplete ? targetMode === "all" ? t("broadcast.auto_29") : t("broadcast.auto_30") : t("broadcast.inProgressDescription", {
      current: successfulTargets,
      total: totalTargets
    })).addFields({
      name: t("broadcast.auto_31"),
      value: t("broadcast.auto_32", {
        var1: successCount
      }),
      inline: true
    }, {
      name: t("broadcast.auto_33"),
      value: t("broadcast.auto_34", {
        var1: fallbackCount
      }),
      inline: true
    }, {
      name: t("broadcast.auto_35"),
      value: t("broadcast.auto_36", {
        var1: failCount
      }),
      inline: true
    });
  };
  let progressUpdate = Promise.resolve();
  const updateProgress = () => {
    progressUpdate = progressUpdate.then(() => interaction.editReply({
      embeds: [createStatusEmbed(false)]
    }).catch(() => {}));
    return progressUpdate;
  };
  await updateProgress();
  const progressInterval = setInterval(() => {
    void updateProgress();
  }, 5000);
  const embed = new EmbedBuilder().setColor("#00FF00").setAuthor({
    name: "📢 Thông báo"
  }).setDescription(messageContent);

  // Duyệt qua tất cả các server được chọn
  for (const [id, guild] of guildsToProcess) {
    try {
      let targetChannel = null;

      // Ép tải danh sách kênh từ Discord API (vì cache có thể chưa đầy đủ khi dùng "all")
      if (guild.channels.cache.size === 0) {
        await guild.channels.fetch().catch(() => {});
      }

      // Ưu tiên Số 1: Lấy kênh đã set trong File Database
      const savedChannelId = await client.database.get(`announce_channel_${id}`);
      if (savedChannelId) {
        targetChannel = guild.channels.cache.get(savedChannelId);
        // Nếu cache miss, thử fetch trực tiếp kênh đó
        if (!targetChannel) {
          try {
            targetChannel = await guild.channels.fetch(savedChannelId);
          } catch (e) {
            targetChannel = null;
          }
        }
      }

      // Ưu tiên Số 2 (Fallback vét máng): Tìm kênh text đầu tiên bot có chìa khóa gửi tin
      let isFallback = false;
      if (!targetChannel) {
        targetChannel = guild.channels.cache.find(c => c.type === ChannelType.GuildText && c.permissionsFor(guild.members.me)?.has("SendMessages"));
        isFallback = true;
      }

      // Phóng tên lửa tin nhắn!
      if (targetChannel) {
        try {
          await targetChannel.send({
            embeds: [embed]
          });
          if (isFallback) fallbackCount++;else successCount++;
        } catch (error) {
          failCount++;
        }
      } else {
        failCount++;
      }
    } catch (err) {
      failCount++;
    }
  }
  clearInterval(progressInterval);
  await progressUpdate;
  return interaction.editReply({
    embeds: [createStatusEmbed(true)]
  }).catch(() => {});
});
module.exports = command;
