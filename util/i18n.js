const fs = require("fs");
const path = require("path");
const { AsyncLocalStorage } = require("async_hooks");
const localesDir = path.join(__dirname, "..", "locales");
const locales = {};
const languageContext = new AsyncLocalStorage();
const DEFAULT_LANGUAGE = "vi";
const languageNames = {
  vi: "Tiếng Việt",
  en: "English",
  ja: "日本語"
};

// Load tất cả file .json trong locales/
function loadLocales() {
  if (!fs.existsSync(localesDir)) return;
  fs.readdirSync(localesDir).filter(f => f.endsWith(".json")).forEach(f => {
    const lang = f.replace(".json", "");
    try {
      locales[lang] = JSON.parse(fs.readFileSync(path.join(localesDir, f), "utf8"));
    } catch (e) {
      console.warn(`Lỗi khi load ngôn ngữ ${f}: ${e.message}`);
    }
  });
}

// Load lần đầu
loadLocales();
let currentLang = DEFAULT_LANGUAGE;

function normalizeLanguage(lang) {
  return typeof lang === "string" && locales[lang] ? lang : DEFAULT_LANGUAGE;
}

/**
 * Đặt ngôn ngữ hiện tại
 * @param {string} lang - Mã ngôn ngữ (vi, en, ja, ...)
 */
function setLanguage(lang) {
  if (locales[lang]) {
    currentLang = lang;
  } else {
    console.warn(`Ngôn ngữ ${lang} không hỗ trợ, đang dùng ${currentLang}`);
  }
}

/**
 * Tải lại file ngôn ngữ (dùng khi /cmd reload)
 */
function runWithLanguage(language, callback) {
  return languageContext.run({
    language: normalizeLanguage(language)
  }, callback);
}

function translate(language, key, vars = {}) {
  return runWithLanguage(language, () => t(key, vars));
}

function reloadLocales() {
  // Xoá cache cũ
  Object.keys(locales).forEach(k => delete locales[k]);
  loadLocales();
}

/**
 * Lấy text theo key, hỗ trợ biến {name}, {value}, ...
 * @param {string} key - Key dạng "player.nowPlaying"
 * @param {Object} vars - Biến thay thế { title: "abc", user: "<@123>" }
 * @returns {string}
 */
function t(key, vars = {}) {
  const language = languageContext.getStore()?.language || currentLang;
  const keys = key.split(".");

  // Tìm trong ngôn ngữ hiện tại
  let text = keys.reduce((obj, k) => obj?.[k], locales[language]);

  // Fallback về tiếng Việt nếu không tìm thấy
  if (text === undefined || text === null) {
    text = keys.reduce((obj, k) => obj?.[k], locales[DEFAULT_LANGUAGE]);
  }

  // Nếu vẫn không có, trả về key gốc (để dễ debug)
  if (text === undefined || text === null) return key;

  // Thay thế biến {name} → giá trị thực
  return text.replace(/\{(\w+)\}/g, (_, k) => vars[k] !== undefined ? String(vars[k]) : `{${k}}`);
}

/**
 * Lấy danh sách ngôn ngữ khả dụng
 * @returns {string[]}
 */
function getAvailableLanguages() {
  return Object.keys(locales);
}

/**
 * Lấy ngôn ngữ hiện tại
 * @returns {string}
 */
function getCurrentLanguage() {
  return languageContext.getStore()?.language || currentLang;
}

function getLanguageName(language) {
  const normalized = normalizeLanguage(language);
  return languageNames[normalized] || normalized;
}
module.exports = {
  t,
  translate,
  runWithLanguage,
  setLanguage,
  reloadLocales,
  getAvailableLanguages,
  getCurrentLanguage,
  getLanguageName,
  normalizeLanguage,
  DEFAULT_LANGUAGE
};
