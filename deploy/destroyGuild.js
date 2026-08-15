const { t } = require("../util/i18n");
//Deletes every commands from every server yikes!!1!!11!!
const readline = require("readline");
const {
  REST,
  Routes
} = require("discord.js");
const getConfig = require("../util/getConfig");
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});
(async () => {
  const config = await getConfig();
  const rest = new REST({
    version: "10"
  }).setToken(config.token);
  if (!process.argv.includes("--global")) {
    rl.question(t("deploy.auto_327"), async guild => {
      console.log(t("deploy.auto_328"));
      await rest.put(Routes.applicationGuildCommands(config.clientId, guild), {
        body: []
      }).catch(console.log);
      console.log(t("deploy.auto_329"));
      rl.close();
    });
  } else {
    console.log(t("deploy.auto_330"));
    await rest.put(Routes.applicationCommands(config.clientId), {
      body: []
    }).catch(console.log);
    console.log(t("deploy.auto_331"));
    process.exit();
  }
})();