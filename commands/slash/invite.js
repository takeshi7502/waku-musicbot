const { t } = require("../../util/i18n");
const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder
} = require("discord.js");
const SlashCommand = require("../../lib/SlashCommand");
const command = new SlashCommand().setName("invite").setDescription(t("invite.auto_76")).setRun(async (client, interaction, options) => {
  return interaction.reply({
    embeds: [new EmbedBuilder().setColor(client.config.embedColor).setTitle(t("invite.auto_77"))],
    components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setLabel(t("invite.auto_78")).setStyle(ButtonStyle.Link).setURL(`https://discord.com/oauth2/authorize?client_id=${client.config.clientId}&permissions=${client.config.permissions}&scope=bot%20applications.commands`))]
  });
});
module.exports = command;