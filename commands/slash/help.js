const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  PermissionFlagsBits
} = require("discord.js");
const {
  getAvailableLanguages,
  getLanguageName,
  normalizeLanguage,
  translate,
  t
} = require("../../util/i18n");
const SlashCommand = require("../../lib/SlashCommand");
const LoadCommands = require("../../util/loadCommands");
const { refreshNowPlayingPanel } = require("../../util/nowPlayingEmbed");

const HELP_TIMEOUT = 10 * 60_000;
const LANGUAGE_MENU_TIMEOUT = 60_000;

const HELP_GROUPS = [
  {
    titleKey: "help.musicGroup",
    commands: ["play", "search", "nowplaying", "seek", "shuffle", "volume", "stop", "summon", "filters"]
  },
  {
    titleKey: "help.serverGroup",
    commands: ["setup", "clean"]
  },
  {
    titleKey: "help.otherGroup",
    commands: ["help", "about", "invite", "ping"]
  }
];

function getHelpDescription(command) {
  const key = `help.commands.${command.name}`;
  const description = t(key);
  return description === key ? command.description : description;
}

function buildHelpEmbed(client, commands) {
  const commandsByName = new Map(commands.map(command => [command.name, command]));
  const addedCommands = new Set();
  const commandLines = [];

  for (const group of HELP_GROUPS) {
    const groupedCommands = group.commands
      .map(name => commandsByName.get(name))
      .filter(Boolean);
    if (groupedCommands.length === 0) continue;

    commandLines.push(`• **${t(group.titleKey)}**`);
    for (const command of groupedCommands) {
      addedCommands.add(command.name);
      commandLines.push(`\`/${command.name}\` — ${getHelpDescription(command)}`);
    }
  }

  const remainingCommands = commands
    .filter(command => !addedCommands.has(command.name))
    .sort((left, right) => left.name.localeCompare(right.name));
  if (remainingCommands.length > 0) {
    commandLines.push(`• **${t("help.otherGroup")}**`);
    for (const command of remainingCommands) {
      commandLines.push(`\`/${command.name}\` — ${getHelpDescription(command)}`);
    }
  }

  return new EmbedBuilder()
    .setColor(client.config.embedColor)
    .setTitle(t("help.auto_73", { var1: client.user.username }))
    .setDescription(commandLines.join("\n"))
    .setTimestamp();
}

function buildHelpButtons(guildId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("help_cmd_language")
      .setLabel(t("help.languageButton"))
      .setStyle(ButtonStyle.Primary)
      .setDisabled(!guildId),
    new ButtonBuilder()
      .setCustomId("help_cmd_close")
      .setLabel(t("help.close"))
      .setStyle(ButtonStyle.Danger)
  );
}

function buildLanguageMenuEmbed(client, guildId, language) {
  return new EmbedBuilder()
    .setColor(client.config.embedColor)
    .setTitle(client.translateGuild(guildId, "help.languageMenuTitle"))
    .setDescription(client.translateGuild(guildId, "help.languageCurrent", {
      language: getLanguageName(language)
    }));
}

function buildLanguageButtons(guildId, currentLanguage) {
  const buttons = getAvailableLanguages()
    .filter(language => language !== currentLanguage)
    .slice(0, 5)
    .map(language => new ButtonBuilder()
      .setCustomId(`help_language:${guildId}:${language}`)
      .setLabel(getLanguageName(language))
      .setStyle(ButtonStyle.Primary));

  return buttons.length > 0 ? [new ActionRowBuilder().addComponents(buttons)] : [];
}

async function openLanguageMenu(client, button) {
  const guildId = button.guildId;
  if (!button.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
    return button.reply({
      embeds: [client.ErrorEmbed(t("lang.noPermission"))],
      ephemeral: true
    });
  }

  const currentLanguage = await client.getGuildLanguage(guildId);
  await button.reply({
    ephemeral: true,
    embeds: [buildLanguageMenuEmbed(client, guildId, currentLanguage)],
    components: buildLanguageButtons(guildId, currentLanguage)
  });

  const menuMessage = await button.fetchReply().catch(() => null);
  if (!menuMessage) return;

  const collector = menuMessage.createMessageComponentCollector({
    time: LANGUAGE_MENU_TIMEOUT,
    filter: languageButton => languageButton.user.id === button.user.id && languageButton.customId.startsWith(`help_language:${guildId}:`)
  });

  collector.on("collect", async languageButton => {
    const language = normalizeLanguage(languageButton.customId.split(":")[2]);
    try {
      await client.setGuildLanguage(guildId, language);
    } catch {
      await languageButton.reply({
        embeds: [client.ErrorEmbed(t("lang.saveError"))],
        ephemeral: true
      }).catch(() => {});
      return;
    }

    const player = client.manager?.getPlayer(guildId);
    if (player?.queue.current) {
      await refreshNowPlayingPanel(client, player).catch(() => {});
    }

    collector.stop("changed");
    await languageButton.update({
      embeds: [new EmbedBuilder()
        .setColor(client.config.embedColor)
        .setDescription(translate(language, "lang.changed", {
          language: getLanguageName(language)
        }))
      ],
      components: []
    }).catch(() => {});
  });

  collector.on("end", (_collected, reason) => {
    if (reason === "time") button.deleteReply().catch(() => {});
  });
}

const command = new SlashCommand()
  .setName("help")
  .setDescription(t("help.auto_72"))
  .setRun(async (client, interaction) => {
    await interaction.deferReply().catch(() => {});

    const loadedCommands = await LoadCommands();
    const commands = loadedCommands.slash.filter(cmd => cmd.description !== "null" && !cmd.adminOnly);
    const message = await interaction.editReply({
      embeds: [buildHelpEmbed(client, commands)],
      components: [buildHelpButtons(interaction.guildId)],
      fetchReply: true
    });

    const collector = message.createMessageComponentCollector({
      time: HELP_TIMEOUT
    });

    collector.on("collect", async button => client.runWithGuildLanguage(interaction.guildId, async () => {
      if (button.customId === "help_cmd_close") {
        await button.deferUpdate().catch(() => {});
        collector.stop("closed");
        return;
      }

      if (button.customId === "help_cmd_language") {
        await openLanguageMenu(client, button);
      }
    }));

    collector.on("end", () => {
      interaction.deleteReply().catch(() => {});
    });
  });

module.exports = command;
