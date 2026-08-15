module.exports = {
	language: "vi", //- Ngôn ngữ (vi, en, ja,...) | Language setting
	helpCmdPerPage: 10, //- Number of commands per page of help command
	lyricsMaxResults: 5, //- Number of results for lyrics command (Do not touch this value if you don't know what you are doing)
	adminId: "UserId", //- Replace UserId with the Discord ID of the admin of the bot
	adminGuildId: "ServerID", //- ID Server trụ sở chính của Admin (Lệnh Admin chỉ hiện ở đây)
	token: process.env.token || "YOUR_TOKEN_HERE", //- Bot's Token
	clientId: process.env.clientId || "YOUR_CLIENT_ID", //- ID of the bot
	clientSecret: process.env.clientSecret || "YOUR_CLIENT_SECRET", //- Client Secret of the bot
	serverDeafen: true, //- If you want bot to stay deafened
	defaultVolume: 50, //- Sets the default volume of the bot, You can change this number anywhere from 1 to 100
	supportServer: "https://discord.gg/eGkwfAQKMF", //- Support Server Link
	Issues: "https://github.com/SudhanPlayz/Discord-MusicBot", //- Bug Report Link
	permissions: 277083450689, //- Bot Inviting Permissions
	disconnectTime: 60000, //- How long should the bot wait before disconnecting from the voice channel (in miliseconds). Set to 1 for instant disconnect.
	twentyFourSeven: false, //- When set to true, the bot will never disconnect from the voice channel
	autoQueue: true, //- When set to true, related songs will automatically be added to the queue
	autoPause: true, //- When set to true, music will automatically be paused if everyone leaves the voice channel
	autoLeave: false, //- When set to true, the bot will automatically leave when no one is in the voice channel (can be combined with 24/7 to always be in voice channel until everyone leaves; if 24/7 is on disconnectTime will add a disconnect delay after everyone leaves.)
	debug: false, //- Debug mode
	searchEngine: "youtube", //- Search engine (only youtube supported)
	// You need a lavalink v4 server for this bot to work!!!!
	nodes: [
		{
			id: "Main Node", //- Used for identifier in stats commands.
			host: "127.0.0.1", //- The host name or IP of the lavalink server.
			port: 2333, // The port that lavalink is listening to. This must be a number!
			authorization: "youshallnotpass", //- The password of the lavalink server.
			retryAmount: 200, //- The amount of times to retry connecting to the node if connection got dropped.
			retryDelay: 40, //- Delay between reconnect attempts if connection is lost.
			secure: false, //- Can be either true or false. Only use true if ssl is enabled!
		},
	],
	embedColor: "#2f3136", //- Color of the embeds, hex supported
	presence: {
		// PresenceData object | https://discord.js.org/#/docs/main/stable/typedef/PresenceData
		status: "online", //- You can have online, idle, dnd and invisible (Note: invisible makes people think the bot is offline)
		activities: [
			{
				name: "Custom Status", //- Tên bắt buộc nội bộ (không hiển thị ra ngoài khi dùng type 4)
				type: 4, //- 4=Custom (Bong bóng), 0=Playing, 1=Streaming, 2=Listening, 3=Watching, 5=Competing
				state: "Playing Music | /play", //- Text hiển thị trong bong bóng (chỉ dùng cho type 4)
			},
		],
	},
	iconURL: "https://cdn.discordapp.com/attachments/1360438209645121620/1491891499116527747/youtube_1.png?ex=69d957bb&is=69d8063b&hm=aa1d3166fc1882fc5fe32e96fb75c63af75470430bc270cc89fef39a2ac310b3&", //- This icon will be in every embed's author field
	// ====== WEB DASHBOARD ======
	port: process.env.PORT || 3000, //- Port cho web dashboard
	website: process.env.WEBSITE || "http://localhost:3000", //- URL website (đổi thành URL thật nếu deploy)
	cookieSecret: process.env.COOKIE_SECRET || "YOUR_SECRET_KEY", //- Secret key cho session cookie
	scopes: ["identify", "guilds"], //- Discord OAuth2 scopes
};
