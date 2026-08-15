/**
 *
 * @param {import("../lib/DiscordMusicBot")} client
 * @param {*} data
 */
module.exports = (client, data) => {
	if (client.manager && typeof client.manager.sendRawData === "function") {
		client.manager.sendRawData(data);
	}
};
