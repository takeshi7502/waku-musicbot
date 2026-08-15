//JotaroKujo0525 note, this is a deed that i should've done a long time ago
require('dotenv').config()

const DiscordMusicBot = require("./lib/DiscordMusicBot");
const { exec } = require("child_process");



const client = new DiscordMusicBot();

console.log("Make sure to fill in the config.js before starting the bot.");

const getClient = () => client;

module.exports = {
	getClient,
};
