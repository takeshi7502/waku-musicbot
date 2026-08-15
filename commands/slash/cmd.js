const {
  t
} = require("../../util/i18n");
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
const cleanDescription = description => String(description || "").replace(/\s*\([^)]*\)/g, "").trim();
const command = new SlashCommand().setName("cmd").setDescription(t("cmd.auto_44")).setAdminOnly(true).setRun(async (client, interaction) => {
  await interaction.deferReply({
    ephemeral: true
  }).catch(_ => {});
  // map the commands name and description to the embed
  const commands = await LoadCommands().then(cmds => {
    return [].concat(cmds.slash) /*.concat(cmds.context)*/;
  });
  // filter to show ONLY admin commands
  const filteredCommands = commands.filter(cmd => cmd.description != "null" && cmd.adminOnly);
  const totalCmds = filteredCommands.length;
  let maxPages = Math.ceil(totalCmds / client.config.helpCmdPerPage) || 1;

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
    name: t("cmd.auto_45", {
      var1: client.user.username
    }),
    iconURL: client.config.iconURL
  }).setTimestamp().setFooter({
    text: `Trang ${pageNo + 1} / ${maxPages}`
  });

  // initial temporary array
  var tempArray = filteredCommands.slice(pageNo * client.config.helpCmdPerPage, pageNo * client.config.helpCmdPerPage + client.config.helpCmdPerPage);
  if (tempArray.length > 0) {
    tempArray.forEach(cmd => {
      helpEmbed.addFields({
        name: `\`/${cmd.name}\``,
        value: cleanDescription(cmd.description)
      });
    });
  } else {
    helpEmbed.setDescription(t("cmd.noHiddenCommands"));
  }
  helpEmbed.addFields({
    name: "Credits",
    value: t("cmd.auto_46", {
      var1: require("../../package.json").version,
      var2: gitHash
    }) + "\n" + `[✨ Discord Server](${client.config.supportServer}) | [Website](https://card.takeshi.dev)`
  });

  // Construction of the buttons for the embed
  const getButtons = pageNo => {
    return new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId("cmd_but_2_app").setEmoji("◀️").setStyle(ButtonStyle.Primary).setDisabled(pageNo == 0), new ButtonBuilder().setCustomId("cmd_but_1_app").setEmoji("▶️").setStyle(ButtonStyle.Primary).setDisabled(pageNo >= maxPages - 1), new ButtonBuilder().setCustomId("cmd_but_close_app").setEmoji("❌").setStyle(ButtonStyle.Secondary));
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
    if (iter.customId === "cmd_but_close_app") {
      collector.stop();
      await iter.deferUpdate().catch(() => {});
      await interaction.deleteReply().catch(() => {});
      return;
    }
    if (iter.customId === "cmd_but_1_app") {
      pageNo++;
    } else if (iter.customId === "cmd_but_2_app") {
      pageNo--;
    }
    helpEmbed.data.fields = [];
    var tempArray = filteredCommands.slice(pageNo * client.config.helpCmdPerPage, pageNo * client.config.helpCmdPerPage + client.config.helpCmdPerPage);
    if (tempArray.length > 0) {
      tempArray.forEach(cmd => {
        helpEmbed.addFields({
          name: `\`/${cmd.name}\``,
          value: cleanDescription(cmd.description)
        }).setFooter({
          text: `Trang ${pageNo + 1} / ${maxPages}`
        });
      });
    }
    helpEmbed.addFields({
      name: "Credits",
      value: t("cmd.auto_47", {
        var1: require("../../package.json").version,
        var2: gitHash
      }) + "\n" + `[✨ Discord Server](${client.config.supportServer}) | [Website](https://card.takeshi.dev)`
    });
    await iter.update({
      embeds: [helpEmbed],
      components: [getButtons(pageNo)],
      fetchReply: true
    });
  });
  collector.on("end", () => {
    interaction.deleteReply().catch(() => {});
  });
});
module.exports = command;