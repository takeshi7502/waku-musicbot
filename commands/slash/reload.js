const {
  EmbedBuilder
} = require("discord.js");
const {
  t
} = require("../../util/i18n");
const SlashCommand = require("../../lib/SlashCommand");
const fs = require("fs");
const path = require("path");
const command = new SlashCommand().setName("reload").setDescription(t("reload.auto_189")).setAdminOnly(true).setRun(async (client, interaction, options) => {
  if (interaction.user.id !== client.config.adminId) {
    return interaction.reply({
      embeds: [new EmbedBuilder().setColor(client.config.embedColor).setDescription(t("cmd.noPermission"))],
      ephemeral: true
    });
  }
  await interaction.deferReply({
    ephemeral: true
  });
  try {
    let reloadLog = [];

    // ======== BƯỚC 1: TẢI LẠI TẤT CẢ LỆNH ========
    let ContextCommandsDirectory = path.join(__dirname, "..", "context");
    fs.readdirSync(ContextCommandsDirectory).forEach(file => {
      delete require.cache[require.resolve(ContextCommandsDirectory + "/" + file)];
      let cmd = require(ContextCommandsDirectory + "/" + file);
      if (cmd.command && cmd.run) {
        client.contextCommands.set(file.split(".")[0].toLowerCase(), cmd);
      }
    });
    let SlashCommandsDirectory = path.join(__dirname, "..", "slash");
    fs.readdirSync(SlashCommandsDirectory).forEach(file => {
      delete require.cache[require.resolve(SlashCommandsDirectory + "/" + file)];
      let cmd = require(SlashCommandsDirectory + "/" + file);
      if (cmd && cmd.run) {
        client.slashCommands.set(file.split(".")[0].toLowerCase(), cmd);
      }
    });
    const totalCmds = client.slashCommands.size + client.contextCommands.size;
    reloadLog.push(t("reload.auto_190", {
      var1: totalCmds
    }));

    // ======== BƯỚC 2: TẢI LẠI CONFIG ========
    const configPath = path.resolve(__dirname, "..", "..", "config.js");
    // Nếu có dev-config thì ưu tiên
    const devConfigPath = path.resolve(__dirname, "..", "..", "dev-config.js");
    let newConfig;
    if (fs.existsSync(devConfigPath)) {
      delete require.cache[require.resolve(devConfigPath)];
      newConfig = require(devConfigPath);
    } else {
      delete require.cache[require.resolve(configPath)];
      newConfig = require(configPath);
    }

    // Xoá cache getConfig để lấy version mới nhất (quan trọng sau git pull)
    const getConfigPath = require.resolve("../../util/getConfig");
    delete require.cache[getConfigPath];
    const { sanitizeConfig } = require("../../util/getConfig");

    // Cập nhật config mới vào client (có sanitize màu và iconURL)
    client.config = sanitizeConfig(newConfig);
    reloadLog.push(t("reload.auto_191"));

    // ======== BƯỚC 4: TẢI LẠI EVENTS ========
    const eventsDir = path.join(__dirname, "..", "..", "events");
    fs.readdirSync(eventsDir).forEach(file => {
      if (!file.endsWith(".js")) return;
      const eventPath = path.join(eventsDir, file);
      delete require.cache[require.resolve(eventPath)];
    });
    reloadLog.push(t("reload.auto_192"));

    // ======== KẾT QUẢ ========
    client.log(t("reload.auto_193", {
      var1: interaction.user.tag,
      var2: reloadLog.join(" | ")
    }));
    return interaction.editReply({
      embeds: [new EmbedBuilder().setColor("#00FF00").setAuthor({
        name: t("reload.auto_194")
      }).setDescription(reloadLog.join("\n")).setFooter({
        text: t("reload.auto_195", {
          var1: interaction.user.username
        })
      }).setTimestamp()]
    });
  } catch (err) {
    console.error("Reload error:", err);
    return interaction.editReply({
      embeds: [new EmbedBuilder().setColor("#FF0000").setDescription(t("reload.auto_196", {
        var1: err.message
      }))]
    });
  }
});
module.exports = command;