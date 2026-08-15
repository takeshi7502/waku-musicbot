const { t } = require("../util/i18n");
const {
  REST,
  Routes
} = require("discord.js");
const getConfig = require("../util/getConfig");
const LoadCommands = require("../util/loadCommands");
(async () => {
  const config = await getConfig();
  const rest = new REST({
    version: "10"
  }).setToken(config.token);
  const allCommands = await LoadCommands().then(cmds => {
    return {
      slash: cmds.slash,
      context: cmds.context
    };
  });

  // Tách lệnh Admin ra khỏi lệnh Toàn Cầu
  const globalSlash = allCommands.slash.filter(cmd => !cmd.adminOnly);
  const adminSlash = allCommands.slash.filter(cmd => cmd.adminOnly);

  // ====== DEPLOY LỆNH TOÀN CẦU (Tất cả Server đều thấy) ======
  const globalCommands = [].concat(globalSlash).concat(allCommands.context);
  console.log(t("deploy.auto_316", {
    var1: globalCommands.length
  }));
  await rest.put(Routes.applicationCommands(config.clientId), {
    body: globalCommands
  }).catch(console.log);
  console.log(t("deploy.auto_317"));

  // ====== DEPLOY LỆNH ADMIN (Chỉ Server trụ sở Admin mới thấy) ======
  if (config.adminGuildId && adminSlash.length > 0) {
    console.log(t("deploy.auto_318", {
      var1: adminSlash.length,
      var2: config.adminGuildId
    }));
    await rest.put(Routes.applicationGuildCommands(config.clientId, config.adminGuildId), {
      body: adminSlash
    }).catch(console.log);
    console.log(t("deploy.auto_319"));
  } else {
    console.log(t("deploy.auto_320"));
  }
})();