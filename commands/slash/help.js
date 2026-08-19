const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder
} = require("discord.js");
const { t } = require("../../util/i18n");
const SlashCommand = require("../../lib/SlashCommand");
const LoadCommands = require("../../util/loadCommands");

function buildHelpEmbed(client, commands, pageNo, maxPages) {
  const start = pageNo * client.config.helpCmdPerPage;
  const pageCommands = commands.slice(start, start + client.config.helpCmdPerPage);
  const embed = new EmbedBuilder()
    .setColor(client.config.embedColor)
    .setAuthor({
      name: t("help.auto_73", { var1: client.user.username })
    })
    .setTimestamp()
    .setFooter({
      text: t("help.page", { current: pageNo + 1, total: maxPages })
    });

  pageCommands.forEach(cmd => {
    embed.addFields({
      name: "`/" + cmd.name + "`",
      value: cmd.description
    });
  });

  return embed;
}

function buildButtons(pageNo, maxPages) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("help_cmd_but_2_app")
      .setEmoji("◀️")
      .setStyle(ButtonStyle.Primary)
      .setDisabled(pageNo === 0),
    new ButtonBuilder()
      .setCustomId("help_cmd_but_1_app")
      .setEmoji("▶️")
      .setStyle(ButtonStyle.Primary)
      .setDisabled(pageNo === maxPages - 1),
    new ButtonBuilder()
      .setCustomId("help_cmd_but_close_app")
      .setLabel(t("help.close"))
      .setStyle(ButtonStyle.Secondary)
  );
}

const command = new SlashCommand()
  .setName("help")
  .setDescription(t("help.auto_72"))
  .setRun(async (client, interaction) => {
    await interaction.deferReply().catch(() => {});

    const loadedCommands = await LoadCommands();
    const commands = loadedCommands.slash.filter(cmd => cmd.description !== "null" && !cmd.adminOnly);
    const maxPages = Math.max(1, Math.ceil(commands.length / client.config.helpCmdPerPage));
    let pageNo = 0;

    const message = await interaction.editReply({
      embeds: [buildHelpEmbed(client, commands, pageNo, maxPages)],
      components: [buildButtons(pageNo, maxPages)],
      fetchReply: true
    });

    const collector = message.createMessageComponentCollector({
      time: 600000
    });

    collector.on("collect", async button => client.runWithGuildLanguage(interaction.guildId, async () => {
      if (button.customId === "help_cmd_but_close_app") {
        await button.deferUpdate().catch(() => {});
        collector.stop();
        return;
      }

      if (button.customId === "help_cmd_but_1_app") {
        pageNo += 1;
      } else if (button.customId === "help_cmd_but_2_app") {
        pageNo -= 1;
      }

      await button.update({
        embeds: [buildHelpEmbed(client, commands, pageNo, maxPages)],
        components: [buildButtons(pageNo, maxPages)]
      }).catch(() => {});
    }));

    collector.on("end", () => {
      interaction.deleteReply().catch(() => {});
    });
  });

module.exports = command;
