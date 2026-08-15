const { t } = require("../../util/i18n");
const SlashCommand = require("../../lib/SlashCommand");
const {
  Client,
  Interaction,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder
} = require("discord.js");
const LoadCommands = require("../../util/loadCommands");
const {
  filter
} = require("lodash");
const command = new SlashCommand().setName("help").setDescription(t("help.auto_72")).setRun(async (client, interaction) => {
  await interaction.deferReply().catch(_ => {});
  // map the commands name and description to the embed
  const commands = await LoadCommands().then(cmds => {
    return [].concat(cmds.slash) /*.concat(cmds.context)*/;
  });
  // from commands remove the ones that have "null" in the description
  // and hide admin-only commands from regular users
  const filteredCommands = commands.filter(cmd => cmd.description != "null" && !cmd.adminOnly);
  const totalCmds = filteredCommands.length;
  let maxPages = Math.ceil(totalCmds / client.config.helpCmdPerPage);

  // if git exists, then get commit hash
  let gitHash = "";
  try {
    gitHash = require("child_process").execSync("git rev-parse --short HEAD").toString().trim();
  } catch (e) {
    gitHash = "unknown";
  }

  // default Page No.
  let pageNo = 0;
  const helpEmbed = new EmbedBuilder().setColor(client.config.embedColor).setAuthor({
    name: t("help.auto_73", {
      var1: client.user.username
    }),
    iconURL: client.config.iconURL
  }).setTimestamp().setFooter({
    text: `Trang ${pageNo + 1} / ${maxPages}`
  });

  // initial temporary array
  var tempArray = filteredCommands.slice(pageNo * client.config.helpCmdPerPage, pageNo * client.config.helpCmdPerPage + client.config.helpCmdPerPage);
  tempArray.forEach(cmd => {
    helpEmbed.addFields({
      name: `\`/${cmd.name}\``,
      value: cmd.description
    });
  });
  helpEmbed.addFields({
    name: "Credits",
    value: t("help.auto_74", {
      var1: require("../../package.json").version,
      var2: gitHash
    }) + "\n" + `[✨ Discord Server](${client.config.supportServer}) | [Website](https://card.takeshi.dev) | [Source Mod](https://github.com/takeshi7502/Discord-MusicBot) | [Source](${client.config.Issues})`
  });

  // Construction of the buttons for the embed
  const getButtons = pageNo => {
    return new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId("help_cmd_but_2_app").setEmoji("◀️").setStyle(ButtonStyle.Primary).setDisabled(pageNo == 0), new ButtonBuilder().setCustomId("help_cmd_but_1_app").setEmoji("▶️").setStyle(ButtonStyle.Primary).setDisabled(pageNo == maxPages - 1), new ButtonBuilder().setCustomId("help_cmd_but_close_app").setEmoji("❌").setStyle(ButtonStyle.Secondary));
  };
  const tempMsg = await interaction.editReply({
    embeds: [helpEmbed],
    components: [getButtons(pageNo)],
    fetchReply: true
  });
  const collector = tempMsg.createMessageComponentCollector({
    time: 600000
  });
  collector.on("collect", async iter => {
    if (iter.customId === "help_cmd_but_close_app") {
      collector.stop();
      await iter.deferUpdate().catch(() => {});
      await interaction.deleteReply().catch(() => {});
      return;
    }
    if (iter.customId === "help_cmd_but_1_app") {
      pageNo++;
    } else if (iter.customId === "help_cmd_but_2_app") {
      pageNo--;
    }
    helpEmbed.data.fields = [];
    var tempArray = filteredCommands.slice(pageNo * client.config.helpCmdPerPage, pageNo * client.config.helpCmdPerPage + client.config.helpCmdPerPage);
    tempArray.forEach(cmd => {
      helpEmbed.addFields({
        name: `\`/${cmd.name}\``,
        value: cmd.description
      }).setFooter({
        text: `Trang ${pageNo + 1} / ${maxPages}`
      });
    });
    helpEmbed.addFields({
      name: "Credits",
      value: t("help.auto_75", {
        var1: require("../../package.json").version,
        var2: gitHash
      }) + "\n" + `[✨ Discord Server](${client.config.supportServer}) | [Website](https://card.takeshi.dev) | [Source Mod](https://github.com/takeshi7502/Discord-MusicBot) | [Source](${client.config.Issues})`
    });
    await iter.update({
      embeds: [helpEmbed],
      components: [getButtons(pageNo)]
    }).catch(() => {});
  });
  collector.on("end", () => {
    interaction.deleteReply().catch(() => {});
  });
});
module.exports = command;