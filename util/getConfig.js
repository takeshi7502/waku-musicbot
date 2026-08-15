const { t } = require("./i18n");
const dotenv = require("dotenv").config();

function sanitizeConfig(config) {
  // Discord chỉ chấp nhận HTTPS URL cho iconURL trong embed
  if (config.iconURL && !/^https?:\/\//i.test(config.iconURL)) {
    config.iconURL = undefined;
  }

  // Discord chỉ chấp nhận hex màu 6 ký tự (#RRGGBB)
  // #RRGGBBAA (8 ký tự) → cắt bỏ 2 ký tự alpha
  if (config.embedColor && typeof config.embedColor === "string") {
    if (/^#[0-9a-f]{8}$/i.test(config.embedColor)) {
      config.embedColor = config.embedColor.slice(0, 7);
    } else if (!/^#[0-9a-f]{6}$/i.test(config.embedColor)) {
      config.embedColor = "#5865F2"; // fallback: Discord blurple
    }
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
        rej(t("getConfig.auto_294"));
      }
    }
  });
}

module.exports = ConfigFetcher;
module.exports.sanitizeConfig = sanitizeConfig;