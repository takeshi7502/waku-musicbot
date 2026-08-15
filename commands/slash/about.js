const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder
} = require("discord.js");
const { t } = require("../../util/i18n");
const SlashCommand = require("../../lib/SlashCommand");

function getGitHash() {
  try {
    return require("child_process").execSync("git rev-parse --short HEAD").toString().trim();
  } catch {
    return t("about.unknownRevision");
  }
}

const command = new SlashCommand()
  .setName("about")
  .setDescription(t("about.description"))
  .setRun(async (client, interaction) => {
    const packageInfo = require("../../package.json");
    const codeTick = String.fromCharCode(96);
    const embed = new EmbedBuilder()
      .setColor(client.config.embedColor)
      .setAuthor({
        name: t("about.author", { botName: client.user.username }),
        iconURL: client.config.iconURL
      })
      .setDescription(t("about.summary"))
      .addFields(
        {
          name: t("about.version"),
          value: codeTick + "v" + packageInfo.version + codeTick,
          inline: true
        },
        {
          name: t("about.revision"),
          value: codeTick + getGitHash() + codeTick,
          inline: true
        }
      );

    const links = [
      { label: t("about.support"), url: client.config.supportServer },
      { label: t("about.website"), url: "https://takeshi.dev" },
      { label: t("about.source"), url: client.config.Issues }
    ].filter(link => typeof link.url === "string" && /^https?:\/\//i.test(link.url));

    const components = links.length > 0
      ? [new ActionRowBuilder().addComponents(links.map(link => new ButtonBuilder()
        .setStyle(ButtonStyle.Link)
        .setLabel(link.label)
        .setURL(link.url)))]
      : [];

    return interaction.reply({
      embeds: [embed],
      components
    });
  });

module.exports = command;
