const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} = require("discord.js");
const {
  t
} = require("../../util/i18n");
const SlashCommand = require("../../lib/SlashCommand");
const command = new SlashCommand().setName("guildleave").setDescription(t("guildleave.auto_50")).setAdminOnly(true).addStringOption(option => option.setName("id").setDescription(t("guildleave.auto_51")).setRequired(true)).setRun(async (client, interaction, options) => {
  try {
    if (interaction.user.id !== client.config.adminId) {
      return interaction.reply({
        ephemeral: true,
        embeds: [new EmbedBuilder().setColor(0xFF0000).setDescription(t("guildleave.noPermission"))]
      });
    }
    const id = interaction.options.getString("id");

    // ── LIST ──────────────────────────────────────────
    if (id.toLowerCase() === "list") {
      // Sắp xếp các server theo thời gian "join" mới nhất lên đầu
      const guildsArray = [...client.guilds.cache.values()].sort((a, b) => b.joinedTimestamp - a.joinedTimestamp);
      if (guildsArray.length === 0) {
        return interaction.reply({
          ephemeral: true,
          embeds: [new EmbedBuilder().setColor(client.config.embedColor).setDescription(t("guildleave.noGuilds"))]
        });
      }
      const itemsPerPage = 50;
      let maxPages = Math.ceil(guildsArray.length / itemsPerPage);
      let pageNo = 0;
      const getButtons = page => {
        return new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId("guildlist_prev").setEmoji("◀️").setStyle(ButtonStyle.Primary).setDisabled(page === 0), new ButtonBuilder().setCustomId("guildlist_next").setEmoji("▶️").setStyle(ButtonStyle.Primary).setDisabled(page === maxPages - 1 || maxPages === 0), new ButtonBuilder().setCustomId("guildlist_close").setEmoji("❌").setStyle(ButtonStyle.Secondary));
      };
      const generateEmbed = page => {
        const start = page * itemsPerPage;
        const currentGuilds = guildsArray.slice(start, start + itemsPerPage);
        const lines = currentGuilds.map((g, i) => t("guildleave.auto_52", {
          var1: start + i + 1,
          var2: g.name,
          var3: g.id,
          var4: g.memberCount
        }));
        return new EmbedBuilder().setColor(client.config.embedColor).setTitle(t("guildleave.guildList", {
          count: client.guilds.cache.size
        })).setDescription(lines.join("\n") || t("guildleave.auto_53")).setFooter({
          text: `Trang ${page + 1} / ${maxPages}`
        });
      };
      const listMsg = await interaction.reply({
        ephemeral: true,
        embeds: [generateEmbed(pageNo)],
        components: maxPages > 1 ? [getButtons(pageNo)] : [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId("guildlist_close").setEmoji("❌").setStyle(ButtonStyle.Secondary))],
        fetchReply: true
      });
      const collector = listMsg.createMessageComponentCollector({
        filter: i => i.user.id === interaction.user.id,
        time: 600000
      });
      collector.on("collect", async iter => {
        if (iter.customId === "guildlist_close") {
          collector.stop();
          await iter.deferUpdate().catch(() => {});
          await interaction.deleteReply().catch(() => {});
          return;
        }
        if (iter.customId === "guildlist_next") {
          pageNo++;
        } else if (iter.customId === "guildlist_prev") {
          pageNo--;
        }
        await iter.update({
          embeds: [generateEmbed(pageNo)],
          components: [getButtons(pageNo)]
        }).catch(() => {});
      });
      collector.on("end", () => {
        interaction.deleteReply().catch(() => {});
      });
      return;
    }

    // ── ALL ───────────────────────────────────────────
    if (id.toLowerCase() === "all") {
      const count = client.guilds.cache.size;
      const warnEmbed = new EmbedBuilder().setColor(0xFF4500).setTitle(t("guildleave.confirmLeaveAll")).setDescription(t("guildleave.auto_54", {
        var1: count
      }) + t("guildleave.auto_55") + client.guilds.cache.map(g => `• ${g.name} (\`${g.id}\`)`).join("\n") + t("guildleave.auto_56")).setFooter({
        text: t("guildleave.auto_57")
      });
      const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId("guildleave_all_confirm").setLabel(t("guildleave.auto_58")).setStyle(ButtonStyle.Danger), new ButtonBuilder().setCustomId("guildleave_all_cancel").setLabel(t("guildleave.auto_59")).setStyle(ButtonStyle.Secondary));
      const warnMsg = await interaction.reply({
        ephemeral: true,
        embeds: [warnEmbed],
        components: [row],
        fetchReply: true
      });
      const collector = warnMsg.createMessageComponentCollector({
        filter: i => i.user.id === interaction.user.id,
        time: 30_000,
        max: 1
      });
      collector.on("collect", async btn => {
        await btn.deferUpdate();
        if (btn.customId === "guildleave_all_cancel") {
          return interaction.editReply({
            embeds: [new EmbedBuilder().setColor(client.config.embedColor).setDescription(t("guildleave.cancelled"))],
            components: []
          });
        }

        // Xác nhận → rời tất cả
        const guilds = [...client.guilds.cache.values()];
        let success = 0,
          failed = 0;
        await interaction.editReply({
          embeds: [new EmbedBuilder().setColor(0xFFA500).setDescription(t("guildleave.leavingAll", {
            count: guilds.length
          }))],
          components: []
        });
        for (const guild of guilds) {
          // KHÔNG BAO GIỜ rời khỏi Server Admin/Trụ sở
          if (guild.id === client.config.adminGuildId) {
            console.log(t("guildleave.auto_60", {
              var1: guild.name
            }));
            continue;
          }
          try {
            await guild.leave();
            console.log(t("guildleave.auto_61", {
              var1: guild.name,
              var2: guild.id
            }));
            success++;
          } catch (err) {
            console.error(t("guildleave.auto_62", {
              var1: guild.name,
              var2: guild.id
            }), err);
            failed++;
          }
        }
        await interaction.editReply({
          embeds: [new EmbedBuilder().setColor(failed === 0 ? 0x00C853 : 0xFF4500).setTitle(t("guildleave.auto_63")).setDescription(t("guildleave.auto_64", {
            var1: success
          }) + (failed > 0 ? t("guildleave.auto_65", {
            var1: failed
          }) : ""))],
          components: []
        });
      });
      collector.on("end", (_, reason) => {
        if (reason === "time") {
          interaction.editReply({
            embeds: [new EmbedBuilder().setColor(client.config.embedColor).setDescription(t("guildleave.auto_66"))],
            components: []
          }).catch(() => {});
        }
      });
      return;
    }

    // ── SINGLE ID ─────────────────────────────────────
    const guild = client.guilds.cache.get(id);
    if (!guild) {
      console.error(t("guildleave.auto_67", {
        var1: id
      }));
      return interaction.reply({
        ephemeral: true,
        content: t("guildleave.auto_68", {
          var1: id
        })
      });
    }
    await guild.leave();
    console.log(t("guildleave.auto_69", {
      var1: guild.name,
      var2: id
    }));
    return interaction.reply({
      ephemeral: true,
      embeds: [new EmbedBuilder().setColor(0x00C853).setDescription(t("guildleave.auto_70", {
        var1: guild.name,
        var2: id
      }))]
    });
  } catch (error) {
    console.error(t("guildleave.auto_71"), error);
    return interaction.reply({
      ephemeral: true,
      content: t("error.generic")
    });
  }
});
module.exports = command;