const { t } = require("../util/i18n");
const {
  EmbedBuilder,
  ButtonBuilder,
  ActionRowBuilder,
  ButtonStyle
} = require("discord.js");
module.exports = async (client, message) => {
  const refront = `^<@!?${client.user.id}>`;
  const mention = new RegExp(refront + "$");
  const invite = `https://discord.com/oauth2/authorize?client_id=${client.config.clientId}&permissions=${client.config.permissions}&scope=bot%20applications.commands`;
  const buttons = new ActionRowBuilder().addComponents(new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel(t("messageCreate.auto_279")).setURL(invite), new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel("Discord server").setURL(`${client.config.supportServer}`));
  if (message.content.match(mention)) {
    const mentionEmbed = new EmbedBuilder().setColor(0xFFFF00).setDescription(t("messageCreate.auto_280"));
    message.channel.send({
      embeds: [mentionEmbed],
      components: [buttons]
    });
  }
};