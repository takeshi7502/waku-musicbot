const {
  ActionRowBuilder,
  ActivityType,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
  EmbedBuilder,
  ModalBuilder,
  StringSelectMenuBuilder,
  TextInputBuilder,
  TextInputStyle
} = require("discord.js");
const fs = require("fs");
const path = require("path");
const { t } = require("../../util/i18n");
const SlashCommand = require("../../lib/SlashCommand");

const ACTIVITY_OPTIONS = [
  { label: "Đang chơi", description: "Playing status", value: "playing", emoji: "🎮" },
  { label: "Đang xem", description: "Watching status", value: "watching", emoji: "👀" },
  { label: "Đang nghe", description: "Listening status", value: "listening", emoji: "🎧" },
  { label: "Đang thi đấu", description: "Competing status", value: "competing", emoji: "🏆" },
  { label: "Đang stream", description: "Streaming status", value: "streaming", emoji: "📺" },
  { label: "Bong bóng Custom", description: "Custom status bubble", value: "custom", emoji: "💬" }
];

const STATUS_OPTIONS = [
  { label: "Online", description: "Hiển thị online", value: "online", emoji: "🟢" },
  { label: "Idle", description: "Hiển thị treo máy", value: "idle", emoji: "🌙" },
  { label: "Do Not Disturb", description: "Hiển thị bận", value: "dnd", emoji: "⛔" },
  { label: "Invisible", description: "Hiển thị offline/ẩn", value: "invisible", emoji: "⚫" }
];

const ACTIVITY_TYPES = {
  playing: ActivityType.Playing,
  streaming: ActivityType.Streaming,
  listening: ActivityType.Listening,
  watching: ActivityType.Watching,
  custom: ActivityType.Custom,
  competing: ActivityType.Competing
};

const ACTIVITY_LABELS = {
  playing: "🎮 Đang chơi",
  watching: "👀 Đang xem",
  listening: "🎧 Đang nghe",
  competing: "🏆 Đang thi đấu",
  streaming: "📺 Đang stream",
  custom: "💬 Bong bóng custom"
};

const STATUS_LABELS = {
  online: "🟢 Online",
  idle: "🌙 Idle",
  dnd: "⛔ Do Not Disturb",
  invisible: "⚫ Invisible"
};

function getCurrentPresence(client) {
  const activity = client.config.presence?.activities?.[0] || {};
  const status = client.config.presence?.status || "online";
  const type = Object.entries(ACTIVITY_TYPES).find(([, value]) => value === activity.type)?.[0] || null;

  return {
    type,
    text: activity.state || activity.name || "Chưa đặt nội dung",
    status
  };
}

function buildPresence(type, text, status) {
  const trimmedText = (text || "").trim();
  const activityType = ACTIVITY_TYPES[type];

  if (!type || activityType === undefined || !trimmedText) {
    return { status: status || "online", activities: [] };
  }

  const activity = {
    name: trimmedText,
    type: activityType
  };

  if (type === "custom") {
    activity.state = trimmedText;
  }

  if (type === "streaming") {
    activity.url = "https://www.youtube.com/watch?v=dQw4w9WgXcQ";
  }

  return {
    status: status || "online",
    activities: [activity]
  };
}

function persistPresence(client, presence) {
  client.config.presence = presence;
  const configPath = path.join(__dirname, "..", "..", "config.js");
  const configCode = fs.readFileSync(configPath, "utf8");
  const replacement = `presence: ${JSON.stringify(presence, null, "\t").replace(/\n/g, "\n\t")},`;
  const nextConfigCode = configCode.replace(/presence:\s*{[\s\S]*?\n\t},\r?\n\ticonURL:/, `${replacement}\n\ticonURL:`);
  fs.writeFileSync(configPath, nextConfigCode);
}

async function applyPresence(client, presence) {
  persistPresence(client, presence);
  await client.user.setPresence(presence);
}

function buildEmbed(client) {
  const current = getCurrentPresence(client);
  return new EmbedBuilder()
    .setColor(client.config.embedColor)
    .setTitle("🌌 BẢNG ĐIỀU KHIỂN ACTIVITY")
    .setDescription([
      `**Activity:** ${ACTIVITY_LABELS[current.type] || "Không có activity"}`,
      `**Nội dung:** \`${current.text}\``,
      `**Trạng thái:** ${STATUS_LABELS[current.status] || "🟢 Online"}`,
      "",
      "Dùng menu bên dưới để đổi kiểu activity hoặc trạng thái online."
    ].join("\n"))
    .setFooter({ text: "/activity • chỉ Admin Bot nhìn thấy bảng này" });
}

function buildComponents() {
  const activitySelect = new StringSelectMenuBuilder()
    .setCustomId("activity_type_select")
    .setPlaceholder("Chọn kiểu activity/status...")
    .setMinValues(1)
    .setMaxValues(1)
    .addOptions(ACTIVITY_OPTIONS);

  const statusSelect = new StringSelectMenuBuilder()
    .setCustomId("activity_status_select")
    .setPlaceholder("Chọn trạng thái online...")
    .setMinValues(1)
    .setMaxValues(1)
    .addOptions(STATUS_OPTIONS);

  const clearButton = new ButtonBuilder()
    .setCustomId("activity_clear")
    .setEmoji("🧹")
    .setLabel("Xóa status")
    .setStyle(ButtonStyle.Danger);

  return [
    new ActionRowBuilder().addComponents(activitySelect),
    new ActionRowBuilder().addComponents(statusSelect),
    new ActionRowBuilder().addComponents(clearButton)
  ];
}

async function showTextModal(client, interaction, mode) {
  const modal = new ModalBuilder()
    .setCustomId(`activity_text_modal_${mode}_${interaction.id}`)
    .setTitle("Chỉnh Activity Bot");

  const input = new TextInputBuilder()
    .setCustomId("activity_text")
    .setLabel("Nhập nội dung activity:")
    .setPlaceholder("Ví dụ: Anime, Lofi chill, Playing Music | /play...")
    .setRequired(true)
    .setMaxLength(128)
    .setStyle(TextInputStyle.Short);

  modal.addComponents(new ActionRowBuilder().addComponents(input));
  await interaction.showModal(modal);

  try {
    const submitted = await interaction.awaitModalSubmit({
      filter: i => i.customId === modal.data.custom_id && i.user.id === interaction.user.id,
      time: 120000
    });
    const text = submitted.fields.getTextInputValue("activity_text").trim();
    const current = getCurrentPresence(client);
    const presence = buildPresence(mode, text, current.status);
    await applyPresence(client, presence);
    await submitted.update({
      embeds: [buildEmbed(client)],
      components: buildComponents()
    }).catch(() => submitted.deferUpdate().catch(() => {}));
  } catch (_) {}
}

const command = new SlashCommand()
  .setName("activity")
  .setDescription(t("activity.auto_1"))
  .setAdminOnly(true)
  .setRun(async (client, interaction) => {
    const message = await interaction.reply({
      embeds: [buildEmbed(client)],
      components: buildComponents(),
      ephemeral: true,
      fetchReply: true
    });

    const collector = message.createMessageComponentCollector({
      filter: i => i.user.id === interaction.user.id
    });

    collector.on("collect", async i => {
      if (i.customId === "activity_type_select") {
        await showTextModal(client, i, i.values[0]);
        return;
      }

      if (i.customId === "activity_status_select") {
        const current = getCurrentPresence(client);
        const presence = buildPresence(current.type, current.text, i.values[0]);
        await applyPresence(client, presence);
        await i.update({ embeds: [buildEmbed(client)], components: buildComponents() }).catch(() => {});
        return;
      }

      if (i.customId === "activity_clear") {
        await applyPresence(client, { status: "online", activities: [] });
        await i.update({ embeds: [buildEmbed(client)], components: buildComponents() }).catch(() => {});
      }
    });
  });

module.exports = command;
