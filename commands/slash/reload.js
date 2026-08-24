const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
} = require("discord.js");
const SlashCommand = require("../../lib/SlashCommand");
const { t, reloadLocales, setLanguage } = require("../../util/i18n");
const fs = require("fs");
const path = require("path");
const { randomUUID } = require("crypto");

const MENU_TIMEOUT = 5 * 60_000;

function buildEmbed(client, title, description, color = null) {
  return new EmbedBuilder()
    .setColor(color || client.config.embedColor)
    .setTitle(title)
    .setDescription(description)
    .setTimestamp();
}

function buildMainMenu(client, token) {
  const updateMode = client.getManagedUpdateMode();
  const isManagedUpdate = updateMode === "managed";
  const isHeroku = updateMode === "heroku";
  const isHerokuDeployAvailable = client.isHerokuDeployAvailable();
  const canRunHardUpdate =
    isManagedUpdate || (isHeroku && isHerokuDeployAvailable);
  const description = [
    t("reload.menuDescription"),
    "",
    t("reload.softDescription"),
    isManagedUpdate
      ? t("reload.hardDescription")
      : isHeroku && isHerokuDeployAvailable
      ? t("reload.herokuDescription")
      : isHeroku
      ? t("reload.herokuUnavailableDescription")
      : t("reload.hardUnavailableDescription"),
  ].join("\n");

  return {
    embeds: [buildEmbed(client, t("reload.menuTitle"), description)],
    components: [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`reload:soft:${token}`)
          .setLabel(t("reload.softButton"))
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId(`reload:hard:${token}`)
          .setLabel(
            isHeroku
              ? t("reload.herokuDeployButton")
              : t("reload.hardButton")
          )
          .setStyle(ButtonStyle.Danger)
          .setDisabled(!canRunHardUpdate)
      ),
    ],
  };
}

function buildHardUpdateConfirmation(client, token, updateMode) {
  const isHeroku = updateMode === "heroku";
  return {
    embeds: [
      buildEmbed(
        client,
        isHeroku
          ? t("reload.herokuConfirmTitle")
          : t("reload.hardConfirmTitle"),
        isHeroku
          ? t("reload.herokuConfirmDescription")
          : t("reload.hardConfirmDescription"),
        "#FFAA00"
      ),
    ],
    components: [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`reload:hard-confirm:${token}`)
          .setLabel(
            isHeroku
              ? t("reload.herokuConfirmButton")
              : t("reload.hardConfirmButton")
          )
          .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
          .setCustomId(`reload:cancel:${token}`)
          .setLabel(t("reload.cancelButton"))
          .setStyle(ButtonStyle.Secondary)
      ),
    ],
  };
}

function reloadCommandCollection(
  client,
  directory,
  collection,
  isContext = false
) {
  collection.clear();
  const files = fs
    .readdirSync(directory)
    .filter((file) => file.endsWith(".js"));

  for (const file of files) {
    const modulePath = path.join(directory, file);
    delete require.cache[require.resolve(modulePath)];
    const command = require(modulePath);
    if (!command?.run || (isContext && !command.command) || command.disabled) {
      continue;
    }
    collection.set(file.slice(0, -3).toLowerCase(), command);
  }
}

async function reloadRuntimeConfig(client) {
  const root = path.resolve(__dirname, "..", "..");
  for (const candidate of [
    path.join(root, "dev-config.js"),
    path.join(root, "config.js"),
    path.join(root, "config.heroku.js"),
  ]) {
    if (!fs.existsSync(candidate)) continue;
    delete require.cache[require.resolve(candidate)];
  }

  const configLoaderPath = require.resolve("../../util/getConfig");
  delete require.cache[configLoaderPath];
  const getConfig = require("../../util/getConfig");
  client.config = await getConfig();
  setLanguage(client.config.language);
  await client.applyPersistedRuntimeConfig();
  if (client.user) await client.user.setPresence(client.config.presence);
}

async function runSoftReload(client, user) {
  const changes = [];
  reloadLocales();
  changes.push(t("reload.softLocales"));

  reloadCommandCollection(
    client,
    path.join(__dirname, "..", "context"),
    client.contextCommands,
    true
  );
  reloadCommandCollection(
    client,
    path.join(__dirname, "..", "slash"),
    client.slashCommands
  );
  changes.push(
    t("reload.softCommands", {
      count: client.slashCommands.size + client.contextCommands.size,
    })
  );

  await reloadRuntimeConfig(client);
  changes.push(t("reload.softConfig"));

  client.log(
    t("reload.reloadLog", {
      user: user.tag,
      log: changes.join(" | "),
    })
  );
  return changes;
}

const command = new SlashCommand()
  .setName("reload")
  .setDescription(t("reload.commandDescription"))
  .setAdminOnly(true)
  .setRun(async (client, interaction) => {
    if (interaction.user.id !== client.config.adminId) {
      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(client.config.embedColor)
            .setDescription(t("cmd.noPermission")),
        ],
        ephemeral: true,
      });
    }

    const token = randomUUID();
    await interaction.reply({
      ephemeral: true,
      ...buildMainMenu(client, token),
    });
    const menuMessage = await interaction.fetchReply().catch(() => null);
    if (!menuMessage) return;

    const collector = menuMessage.createMessageComponentCollector({
      time: MENU_TIMEOUT,
      filter: (button) =>
        button.user.id === interaction.user.id &&
        button.customId.endsWith(token),
    });

    collector.on("collect", async (button) => {
      const action = button.customId.split(":")[1];

      if (action === "soft") {
        collector.stop("used");
        await button.deferUpdate().catch(() => {});
        try {
          const changes = await runSoftReload(client, interaction.user);
          await interaction.editReply({
            embeds: [
              buildEmbed(
                client,
                t("reload.softCompleteTitle"),
                changes.join("\n"),
                "#00FF00"
              ),
            ],
            components: [],
          });
        } catch (error) {
          await interaction.editReply({
            embeds: [
              buildEmbed(
                client,
                t("reload.softFailedTitle"),
                t("reload.error", { error: error.message }),
                "#FF0000"
              ),
            ],
            components: [],
          });
        }
        return;
      }

      if (action === "hard") {
        return button.update(
          buildHardUpdateConfirmation(
            client,
            token,
            client.getManagedUpdateMode()
          )
        );
      }

      if (action === "cancel") {
        return button.update(buildMainMenu(client, token));
      }

      if (action !== "hard-confirm") return;

      collector.stop("queued");
      await button.deferUpdate().catch(() => {});
      try {
        const journal = await client.queueManagedBotUpdate({
          user: interaction.user,
          channelId: interaction.channelId,
          guildId: interaction.guildId,
        });
        await interaction.editReply({
          embeds: [
            buildEmbed(
              client,
              journal.mode === "heroku"
                ? t("reload.herokuQueuedTitle")
                : t("reload.hardQueuedTitle"),
              journal.mode === "heroku"
                ? t("reload.herokuQueuedDescription", {
                    count: journal.snapshots.length,
                  })
                : t("reload.hardQueuedDescription", {
                    count: journal.snapshots.length,
                  }),
              "#FFAA00"
            ),
          ],
          components: [],
        });
      } catch (error) {
        const key =
          error.code === "MANAGED_UPDATE_UNAVAILABLE"
            ? "reload.hardUnavailable"
            : error.code === "HEROKU_DEPLOY_UNAVAILABLE"
            ? "reload.herokuUnavailable"
            : error.code === "MANAGED_UPDATE_IN_PROGRESS"
            ? "reload.hardInProgress"
            : "reload.error";
        await interaction.editReply({
          embeds: [
            buildEmbed(
              client,
              client.getManagedUpdateMode() === "heroku"
                ? t("reload.herokuFailedTitle")
                : t("reload.hardFailedTitle"),
              t(key, { error: error.message }),
              "#FF0000"
            ),
          ],
          components: [],
        });
      }
    });

    collector.on("end", (_collected, reason) => {
      if (["used", "queued"].includes(reason)) return;
      interaction.editReply({ components: [] }).catch(() => {});
    });
  });

module.exports = command;
