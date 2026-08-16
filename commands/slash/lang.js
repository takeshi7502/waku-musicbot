const { EmbedBuilder, PermissionFlagsBits } = require("discord.js");
const SlashCommand = require("../../lib/SlashCommand");
const {
  getAvailableLanguages,
  getLanguageName,
  normalizeLanguage,
  translate,
  t
} = require("../../util/i18n");
const { refreshNowPlayingPanel } = require("../../util/nowPlayingEmbed");

const languageChoices = getAvailableLanguages()
  .slice(0, 25)
  .map(language => ({
    name: getLanguageName(language),
    value: language
  }));

const command = new SlashCommand()
  .setName("lang")
  .setDescription(t("lang.description"))
  .setDMPermission(false)
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .addStringOption(option => option
    .setName("language")
    .setDescription(t("lang.option"))
    .setRequired(true)
    .addChoices(...languageChoices)
  )
  .setRun(async (client, interaction, options) => {
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
      return interaction.reply({
        embeds: [client.ErrorEmbed(t("lang.noPermission"))],
        ephemeral: true
      });
    }

    const language = normalizeLanguage(options.getString("language", true));
    try {
      await client.setGuildLanguage(interaction.guildId, language);
    } catch {
      return interaction.reply({
        embeds: [client.ErrorEmbed(t("lang.saveError"))],
        ephemeral: true
      });
    }

    const player = client.manager?.getPlayer(interaction.guildId);
    if (player?.queue.current) {
      await refreshNowPlayingPanel(client, player).catch(() => {});
    }

    return interaction.reply({
      embeds: [new EmbedBuilder()
        .setColor(client.config.embedColor)
        .setDescription(translate(language, "lang.changed", {
          language: getLanguageName(language)
        })
      )],
      ephemeral: true
    });
  });

module.exports = command;
