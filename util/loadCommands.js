const { t } = require("./i18n");
const {
  join
} = require("path");
const fs = require("fs");
const LoadCommands = () => {
  return new Promise(async resolve => {
    let slash = await LoadDirectory("slash");
    let context = await LoadDirectory("context");
    resolve({
      slash,
      context
    });
  });
};
const LoadDirectory = dir => {
  return new Promise(resolve => {
    let commands = [];
    let CommandsDir = join(__dirname, "..", "commands", dir);
    fs.readdir(CommandsDir, (err, files) => {
      if (err) {
        throw err;
      }
      for (const file of files) {
        const filePath = CommandsDir + "/" + file;
        delete require.cache[require.resolve(filePath)];
        let cmd = require(filePath);
        if (!cmd || dir == "context" && !cmd.command) {
          return console.log(t("loadCommands.auto_300") + file.split(".")[0] + t("loadCommands.auto_301"));
        }
        if (cmd.disabled) {
          continue;
        }
        if (dir == "context") {
          commands.push(cmd.command);
        } else {
          commands.push(cmd);
        }
      }
      ;
      resolve(commands);
    });
  });
};
module.exports = LoadCommands;