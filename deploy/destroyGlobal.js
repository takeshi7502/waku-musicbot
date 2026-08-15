const { t } = require("../util/i18n");
const {
  Client,
  GatewayIntentBits
} = require("discord.js");
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages]
});
const config = require("../config");
client.login(config.token);
client.on("ready", async () => {
  const commands = await client.application.commands.fetch();
  if (commands.size === 0) {
    console.log(t("deploy.auto_324"));
    process.exit();
  }
  let deletedCount = 0;
  commands.forEach(async command => {
    await client.application.commands.delete(command.id);
    console.log(t("deploy.auto_325", {
      var1: command.id
    }));
    deletedCount++;
    if (deletedCount === commands.size) {
      console.log(t("deploy.auto_326"));
      process.exit();
    }
  });
});