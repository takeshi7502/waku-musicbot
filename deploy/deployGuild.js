const { t } = require("../util/i18n");
const readline = require("readline");
const {
  REST,
  Routes
} = require("discord.js");
const getConfig = require("../util/getConfig");
const LoadCommands = require("../util/loadCommands");
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});
(async () => {
  const config = await getConfig();
  const rest = new REST({
    version: "10"
  }).setToken(config.token);
  const commands = await LoadCommands().then(cmds => {
    return [].concat(cmds.slash).concat(cmds.context);
  });
  rl.question(t("deploy.auto_321"), async guild => {
    console.log(t("deploy.auto_322"));
    await rest.put(Routes.applicationGuildCommands(config.clientId, guild), {
      body: commands
    }).catch(console.log);
    console.log(t("deploy.auto_323"));
    rl.close();
  });
})();