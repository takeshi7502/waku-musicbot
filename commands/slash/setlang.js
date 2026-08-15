const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType
} = require("discord.js");
const { t, getAvailableLanguages, setLanguage } = require("../../util/i18n");
const SlashCommand = require("../../lib/SlashCommand");
const fs = require("fs");
const path = require("path");

const command = new SlashCommand()
  .setName("setlang")
  .setDescription(t("setlang.auto_1"))
  .setAdminOnly(true)
  .setRun(async (client, interaction, options) => {
    
    // Create an array of buttons based on available languages
    const languages = getAvailableLanguages();
    const row = new ActionRowBuilder();

    // Mapping language codes to readable names (Optional but nice)
    const langNames = {
        "en": "English",
        "vi": "Tiếng Việt",
        "ja": "日本語"
    };

    languages.forEach(lang => {
        row.addComponents(
            new ButtonBuilder()
                .setCustomId(`lang_${lang}`)
                .setLabel(langNames[lang] || lang)
                .setStyle(ButtonStyle.Primary)
        );
    });

    const embed = new EmbedBuilder()
        .setColor(client.config.embedColor)
        .setDescription(t("setlang.selectLanguage"));

    const message = await interaction.reply({
        embeds: [embed],
        components: [row],
        ephemeral: true,
        fetchReply: true
    });

    const collector = message.createMessageComponentCollector({
        componentType: ComponentType.Button
    });

    collector.on('collect', async i => {
        const lang = i.customId.split("_")[1];
        
        // 1. Update memory
        setLanguage(lang);
        client.config.language = lang;

        // 2. Persist to config.js
        try {
            const configPath = path.join(__dirname, "..", "..", "config.js");
            let configCode = fs.readFileSync(configPath, "utf8");
            
            // Regex to smartly replace the language property
            configCode = configCode.replace(/language:\s*['"][a-zA-Z0-9_]+['"],/g, `language: "${lang}",`);
            fs.writeFileSync(configPath, configCode);
        } catch (e) {
            client.log("Could not write language to config.js: " + e.message);
        }

        const successEmbed = new EmbedBuilder()
            .setColor(client.config.embedColor)
            .setDescription(t("setlang.changed", { language: langNames[lang] || lang }));
            
        await i.update({ embeds: [successEmbed], components: [] });
        collector.stop();
    });
});

module.exports = command;
