const { t } = require("./i18n");
const dotenv = require("dotenv").config();

const DEFAULT_EMBED_COLOR = "#485e8d";

function sanitizeConfig(config) {
  // Discord chỉ chấp nhận hex màu 6 ký tự (#RRGGBB)
  // #RRGGBBAA (8 ký tự) → cắt bỏ 2 ký tự alpha
  const embedColor = typeof config.embedColor === "string" ? config.embedColor.trim() : "";
  if (/^#[0-9a-f]{8}$/i.test(embedColor)) {
    config.embedColor = embedColor.slice(0, 7);
  } else if (/^#[0-9a-f]{6}$/i.test(embedColor)) {
    config.embedColor = embedColor;
  } else {
    config.embedColor = DEFAULT_EMBED_COLOR;
  }

  return config;
}

function ConfigFetcher() {
  return new Promise((res, rej) => {
    try {
      const config = require("../dev-config");
      res(sanitizeConfig(config));
    } catch {
      try {
        const config = require("../config");
        res(sanitizeConfig(config));
      } catch {
        // config.js is intentionally not deployed to Heroku because it holds
        // secrets. The production-safe equivalent reads Heroku Config Vars.
        if (process.env.DYNO || process.env.HEROKU_APP_NAME) {
          try {
            const config = require("../config.heroku");
            res(sanitizeConfig(config));
          } catch (error) {
            rej(error instanceof Error ? error.message : t("getConfig.auto_294"));
          }
          return;
        }

        rej(t("getConfig.auto_294"));
      }
    }
  });
}

module.exports = ConfigFetcher;
module.exports.sanitizeConfig = sanitizeConfig;
