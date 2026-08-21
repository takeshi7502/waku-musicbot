"use strict";

// This file is intentionally safe to commit. Heroku supplies secrets through
// Config Vars; never add a production config.js file to the repository.
const baseConfig = require("./config_example");

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`[HEROKU] Missing required Config Var: ${name}`);
  }
  return value;
}

function numberValue(name, fallback, { min = 1, max = Number.MAX_SAFE_INTEGER } = {}) {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;

  const value = Number(raw);
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(`[HEROKU] ${name} must be an integer between ${min} and ${max}.`);
  }
  return value;
}

function booleanValue(name, fallback = false) {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  if (/^(true|1|yes)$/i.test(raw)) return true;
  if (/^(false|0|no)$/i.test(raw)) return false;
  throw new Error(`[HEROKU] ${name} must be true or false.`);
}

const lavalinkPort = numberValue("LAVALINK_PORT", 3333, { min: 1, max: 65535 });

module.exports = {
  ...baseConfig,
  language: process.env.BOT_LANGUAGE || "vi",
  adminId: required("BOT_ADMIN_ID"),
  adminGuildId: process.env.BOT_ADMIN_GUILD_ID || "",
  token: required("DISCORD_TOKEN"),
  clientId: required("DISCORD_CLIENT_ID"),
  clientSecret: process.env.DISCORD_CLIENT_SECRET || "",
  mongoURI: required("MONGODB_URI"),
  nodes: [
    {
      id: process.env.LAVALINK_NODE_ID || "node0",
      host: required("LAVALINK_HOST"),
      port: lavalinkPort,
      authorization: required("LAVALINK_PASSWORD"),
      retryAmount: numberValue("LAVALINK_RETRY_AMOUNT", 200, { min: 0, max: 1000 }),
      retryDelay: numberValue("LAVALINK_RETRY_DELAY", 1000, { min: 0, max: 60000 }),
      secure: booleanValue("LAVALINK_SECURE", false),
      requestTimeout: numberValue("LAVALINK_REQUEST_TIMEOUT", 60000, { min: 1000, max: 300000 }),
    },
  ],
  // A worker dyno does not need an HTTP listener. Keep the old bot status API
  // off unless the project is deliberately changed to a web dyno.
  publicStatusApi: {
    enabled: false,
    host: "127.0.0.1",
    port: numberValue("PORT", 3000, { min: 1, max: 65535 }),
    domain: process.env.WEBSITE || "",
  },
  port: numberValue("PORT", 3000, { min: 1, max: 65535 }),
  website: process.env.WEBSITE || "",
  cookieSecret: process.env.COOKIE_SECRET || "",
};
