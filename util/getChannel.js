const { t } = require("./i18n");
/**
 *
 * @param {import("../lib/DiscordMusicBot")} client
 * @param {import("discord.js").GuildCommandInteraction} interaction
 * @returns
 */
module.exports = async (client, interaction) => {
	return new Promise(async (resolve) => {
		if (!interaction.member.voice.channel) {
			// Super skill cho Admin: Tự động fake voice channel sang channel mặc định
			if (interaction.user.id === client.config.adminId && client.config.superSkillChannelId) {
				const superChannel = interaction.guild.channels.cache.get(client.config.superSkillChannelId);
				const targetChannel = interaction.guild.members.me.voice.channel || superChannel;
				if (targetChannel) return resolve(targetChannel);
			}

			const replyData = { ephemeral: true, 
				embeds: [
					client.ErrorEmbed(t("common.noVoiceChannel")),
				],
			};
			interaction.deferred || interaction.replied ? await interaction.editReply(replyData).catch(()=>{}) : await interaction.reply(replyData).catch(()=>{});
			return resolve(false);
		}
		if (
			interaction.guild.members.me.voice.channel &&
			interaction.member.voice.channel.id !== interaction.guild.members.me.voice.channel.id
		) {
			// Bỏ qua rào cản same channel đối với Admin nếu gọi kênh hiện tại
			if (interaction.user.id === client.config.adminId) {
                return resolve(interaction.guild.members.me.voice.channel);
            }

			const replyData = { ephemeral: true, 
				embeds: [
					client.ErrorEmbed(t("common.sameVoiceChannel")),
				],
			};
			interaction.deferred || interaction.replied ? await interaction.editReply(replyData).catch(()=>{}) : await interaction.reply(replyData).catch(()=>{});
			return resolve(false);
		}
		if (!interaction.member.voice.channel.joinable) {
			const replyData = { ephemeral: true, 
				embeds: [
					client.ErrorEmbed(t("common.noPermissionJoin")),
				],
			};
			interaction.deferred || interaction.replied ? await interaction.editReply(replyData).catch(()=>{}) : await interaction.reply(replyData).catch(()=>{});
			return resolve(false);
		}
		
		resolve(interaction.member.voice.channel);
	});
};
