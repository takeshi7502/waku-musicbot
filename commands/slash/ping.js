const { t } = require("../../util/i18n");
const {
  EmbedBuilder
} = require("discord.js");
const SlashCommand = require("../../lib/SlashCommand");
const command = new SlashCommand().setName("ping").setDescription(t("ping.auto_164")).setRun(async (client, interaction, options) => {
  // Tính bot latency dựa trên thời gian hiện tại và thời điểm nhận tương tác
  const botPing = Date.now() - interaction.createdTimestamp;
  const apiPing = client.ws.ping;

  // Các biểu tượng trạng thái
  const zap = "⚡";
  const green = "🟢";
  const red = "🔴";
  const yellow = "🟡";
  let botState = zap;
  let apiState = zap;
  if (apiPing >= 40 && apiPing < 200) {
    apiState = green;
  } else if (apiPing >= 200 && apiPing < 400) {
    apiState = yellow;
  } else if (apiPing >= 400) {
    apiState = red;
  }
  if (botPing >= 40 && botPing < 200) {
    botState = green;
  } else if (botPing >= 200 && botPing < 400) {
    botState = yellow;
  } else if (botPing >= 400) {
    botState = red;
  }

  // Chọn màu cho viền embed: dùng client.config.embedColor nếu có, nếu không mặc định "#0099ff"
  const embedColor = client.config.embedColor || "blue";

  // Tạo embed với bố cục gọn gàng
  const embed = new EmbedBuilder().setColor(embedColor).setTitle("🏓 | Pong!").setDescription(`**API Latency:** ${apiState} | ${apiPing}ms\n` + `**Bot Latency:** ${botState} | ${botPing}ms`);

  // Gửi kết quả dưới dạng ephemeral (chỉ hiển thị cho người dùng gửi lệnh)
  interaction.reply({
    embeds: [embed],
    ephemeral: true
  });
});
module.exports = command;