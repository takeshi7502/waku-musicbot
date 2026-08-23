const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder
} = require("discord.js");
const { t } = require("../../util/i18n");
const SlashCommand = require("../../lib/SlashCommand");
const LoadCommands = require("../../util/loadCommands");
const statsCommand = require("./stats");
const activityCommand = require("./activity");

const CMD_TIMEOUT = 10 * 60_000;
const ADMIN_COMMAND_GROUPS = [
  {
    titleKey: "cmd.systemGroup",
    commands: ["status", "lavalink", "reload"]
  },
  {
    titleKey: "cmd.serverGroup",
    commands: ["broadcast", "setlog", "guildleave"]
  },
  {
    titleKey: "cmd.otherGroup",
    commands: ["cmd"]
  }
];

function getCommandDescription(command) {
  const key = `cmd.commands.${command.name}`;
  const description = t(key);
  return description === key ? command.description : description;
}

function buildCommandEmbed(client, commands) {
  const commandsByName = new Map(commands.map(command => [command.name, command]));
  const addedCommands = new Set();
  const commandLines = [];

  for (const group of ADMIN_COMMAND_GROUPS) {
    const groupedCommands = group.commands
      .map(name => commandsByName.get(name))
      .filter(Boolean);
    if (groupedCommands.length === 0) continue;

    commandLines.push(`• **${t(group.titleKey)}**`);
    for (const currentCommand of groupedCommands) {
      addedCommands.add(currentCommand.name);
      commandLines.push(`\`/${currentCommand.name}\` — ${getCommandDescription(currentCommand)}`);
    }
  }

  const remainingCommands = commands
    .filter(currentCommand => !addedCommands.has(currentCommand.name))
    .sort((left, right) => left.name.localeCompare(right.name));
  if (remainingCommands.length > 0) {
    commandLines.push(`• **${t("cmd.otherGroup")}**`);
    for (const currentCommand of remainingCommands) {
      commandLines.push(`\`/${currentCommand.name}\` — ${getCommandDescription(currentCommand)}`);
    }
  }

  return new EmbedBuilder()
    .setColor(client.config.embedColor)
    .setTitle(t("cmd.auto_45", {
      var1: client.user.username
    }))
    .setDescription(commandLines.length > 0 ? commandLines.join("\n") : t("cmd.noHiddenCommands"))
    .setTimestamp();
}

function buildButtons() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("cmd_stats")
      .setLabel("Stats")
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId("cmd_activity")
      .setLabel("Activity")
      .setStyle(ButtonStyle.Primary)
  );
}

const command = new SlashCommand()
  .setName("cmd")
  .setDescription(t("cmd.auto_44"))
  .setAdminOnly(true)
  .setRun((client, interaction) => client.withGuildLanguage(interaction.guildId, async () => {
    await interaction.deferReply({
      ephemeral: true
    }).catch(() => {});

    const loadedCommands = await LoadCommands();
    const adminCommands = loadedCommands.slash.filter(currentCommand => currentCommand.description !== "null" && currentCommand.adminOnly);
    const message = await interaction.editReply({
      embeds: [buildCommandEmbed(client, adminCommands)],
      components: [buildButtons()],
      fetchReply: true
    });

    const collector = message.createMessageComponentCollector({
      time: CMD_TIMEOUT,
      filter: button => button.user.id === interaction.user.id
    });

    collector.on("collect", button => client.withGuildLanguage(interaction.guildId, async () => {
      if (button.customId === "cmd_stats") {
        await button.reply({
          embeds: [statsCommand.getEmbed(client)],
          ephemeral: true
        }).catch(() => {});
        return;
      }

      if (button.customId === "cmd_activity") {
        await activityCommand.openMenu(client, button).catch(() => {});
      }
    }));

    collector.on("end", () => {
      interaction.deleteReply().catch(() => {});
    });
  }));

module.exports = command;
