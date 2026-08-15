const {
  EmbedBuilder
} = require("discord.js");
const {
  t
} = require("../../util/i18n");
const SlashCommand = require("../../lib/SlashCommand");
const command = new SlashCommand().setName("filters").setDescription(t("filters.auto_48")).addStringOption(option => option.setName("preset").setDescription(t("filters.auto_49")).setRequired(true).addChoices({
  name: "Nightcore",
  value: "nightcore"
}, {
  name: "BassBoost",
  value: "bassboost"
}, {
  name: "Vaporwave",
  value: "vaporwave"
}, {
  name: "Pop",
  value: "pop"
}, {
  name: "Soft",
  value: "soft"
}, {
  name: "Treblebass",
  value: "treblebass"
}, {
  name: "Eight Dimension",
  value: "eightD"
}, {
  name: "Karaoke",
  value: "karaoke"
}, {
  name: "Vibrato",
  value: "vibrato"
}, {
  name: "Tremolo",
  value: "tremolo"
}, {
  name: "Reset",
  value: "off"
})).setRun(async (client, interaction, options) => {
  const args = interaction.options.getString("preset");
  let channel = await client.getChannel(client, interaction);
  if (!channel) {
    return;
  }
  let player;
  if (client.manager) {
    player = client.manager.getPlayer(interaction.guild.id);
  } else {
    return interaction.reply({
      embeds: [new EmbedBuilder().setColor(0xFF0000).setDescription(t("common.noLavalink"))]
    });
  }
  if (!player) {
    return interaction.reply({
      embeds: [new EmbedBuilder().setColor(0xFF0000).setDescription(t("filters.noMusicPlaying"))],
      ephemeral: true
    });
  }

  // create a new embed
  let filtersEmbed = new EmbedBuilder().setColor(client.config.embedColor);
  if (args == "nightcore") {
    filtersEmbed.setDescription(t("filters.nightcore"));
    await player.node.updatePlayer({
      guildId: player.guildId,
      playerOptions: {
        filters: {
          timescale: {
            speed: 1.3,
            pitch: 1.3,
            rate: 1.0
          }
        }
      }
    });
  } else if (args == "bassboost") {
    filtersEmbed.setDescription(t("filters.bassboost"));
    await player.node.updatePlayer({
      guildId: player.guildId,
      playerOptions: {
        filters: {
          equalizer: [{
            band: 0,
            gain: 0.6
          }, {
            band: 1,
            gain: 0.67
          }, {
            band: 2,
            gain: 0.67
          }, {
            band: 3,
            gain: 0.4
          }, {
            band: 4,
            gain: -0.5
          }, {
            band: 5,
            gain: 0.15
          }, {
            band: 6,
            gain: -0.45
          }, {
            band: 7,
            gain: 0.23
          }, {
            band: 8,
            gain: 0.35
          }, {
            band: 9,
            gain: 0.45
          }, {
            band: 10,
            gain: 0.55
          }, {
            band: 11,
            gain: 0.6
          }, {
            band: 12,
            gain: 0.55
          }, {
            band: 13,
            gain: 0
          }]
        }
      }
    });
  } else if (args == "vaporwave") {
    filtersEmbed.setDescription(t("filters.vaporwave"));
    await player.node.updatePlayer({
      guildId: player.guildId,
      playerOptions: {
        filters: {
          timescale: {
            speed: 0.8,
            pitch: 0.8,
            rate: 1.0
          },
          equalizer: [{
            band: 0,
            gain: 0.3
          }, {
            band: 1,
            gain: 0.3
          }, {
            band: 2,
            gain: 0.2
          }]
        }
      }
    });
  } else if (args == "pop") {
    filtersEmbed.setDescription(t("filters.pop"));
    await player.node.updatePlayer({
      guildId: player.guildId,
      playerOptions: {
        filters: {
          equalizer: [{
            band: 0,
            gain: 0.65
          }, {
            band: 1,
            gain: 0.45
          }, {
            band: 2,
            gain: -0.45
          }, {
            band: 3,
            gain: -0.65
          }, {
            band: 4,
            gain: -0.35
          }, {
            band: 5,
            gain: 0.45
          }, {
            band: 6,
            gain: 0.55
          }, {
            band: 7,
            gain: 0.6
          }, {
            band: 8,
            gain: 0.6
          }, {
            band: 9,
            gain: 0.6
          }, {
            band: 10,
            gain: 0
          }, {
            band: 11,
            gain: 0
          }, {
            band: 12,
            gain: 0
          }, {
            band: 13,
            gain: 0
          }]
        }
      }
    });
  } else if (args == "soft") {
    filtersEmbed.setDescription(t("filters.soft"));
    await player.node.updatePlayer({
      guildId: player.guildId,
      playerOptions: {
        filters: {
          lowPass: {
            smoothing: 20.0
          }
        }
      }
    });
  } else if (args == "treblebass") {
    filtersEmbed.setDescription(t("filters.treblebass"));
    await player.node.updatePlayer({
      guildId: player.guildId,
      playerOptions: {
        filters: {
          equalizer: [{
            band: 0,
            gain: 0.6
          }, {
            band: 1,
            gain: 0.67
          }, {
            band: 2,
            gain: 0.67
          }, {
            band: 3,
            gain: 0
          }, {
            band: 4,
            gain: -0.5
          }, {
            band: 5,
            gain: 0.15
          }, {
            band: 6,
            gain: -0.45
          }, {
            band: 7,
            gain: 0.23
          }, {
            band: 8,
            gain: 0.35
          }, {
            band: 9,
            gain: 0.45
          }, {
            band: 10,
            gain: 0.55
          }, {
            band: 11,
            gain: 0.6
          }, {
            band: 12,
            gain: 0.55
          }, {
            band: 13,
            gain: 0
          }]
        }
      }
    });
  } else if (args == "eightD") {
    filtersEmbed.setDescription(t("filters.eightDimension"));
    await player.node.updatePlayer({
      guildId: player.guildId,
      playerOptions: {
        filters: {
          rotation: {
            rotationHz: 0.2
          }
        }
      }
    });
  } else if (args == "karaoke") {
    filtersEmbed.setDescription(t("filters.karaoke"));
    await player.node.updatePlayer({
      guildId: player.guildId,
      playerOptions: {
        filters: {
          karaoke: {
            level: 1.0,
            monoLevel: 1.0,
            filterBand: 220.0,
            filterWidth: 100.0
          }
        }
      }
    });
  } else if (args == "vibrato") {
    filtersEmbed.setDescription(t("filters.vibrato"));
    await player.node.updatePlayer({
      guildId: player.guildId,
      playerOptions: {
        filters: {
          vibrato: {
            frequency: 10.0,
            depth: 0.9
          }
        }
      }
    });
  } else if (args == "tremolo") {
    filtersEmbed.setDescription(t("filters.tremolo"));
    await player.node.updatePlayer({
      guildId: player.guildId,
      playerOptions: {
        filters: {
          tremolo: {
            frequency: 5.0,
            depth: 0.6
          }
        }
      }
    });
  } else if (args == "off") {
    filtersEmbed.setDescription(t("filters.eqCleared"));
    await player.node.updatePlayer({
      guildId: player.guildId,
      playerOptions: {
        filters: {}
      }
    });
  } else {
    filtersEmbed.setDescription(t("filters.invalidFilter"));
  }
  return interaction.reply({
    embeds: [filtersEmbed]
  });
});
module.exports = command;