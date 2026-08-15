const {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
  Collection,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder
} = require("discord.js");
const {
  escapeMarkdown
} = require("discord.js");
const fs = require("fs");
const path = require("path");
const prettyMilliseconds = require("pretty-ms");
const jsoning = require("jsoning"); // Documentation: https://jsoning.js.org/
const {
  LavalinkManager
} = require("lavalink-client");

// Format ms to mm:ss or hh:mm:ss
function formatTime(ms) {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor(s % 3600 / 60);
  const sec = s % 60;
  const pad = n => n.toString().padStart(2, '0');
  return h > 0 ? `${pad(h)}:${pad(m)}:${pad(sec)}` : `${pad(m)}:${pad(sec)}`;
}
const ConfigFetcher = require("../util/getConfig");
const Logger = require("./Logger");
const getLavalink = require("../util/getLavalink");
const getChannel = require("../util/getChannel");
const colors = require("colors");
const {
  t,
  setLanguage
} = require("../util/i18n");
class DiscordMusicBot extends Client {
  /**
   * Create the music client
   * @param {import("discord.js").ClientOptions} props - Client options
   */
  constructor(props = {
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates, GatewayIntentBits.GuildMessages]
  }) {
    super(props);
    ConfigFetcher().then(conf => {
      this.config = conf;
      setLanguage(this.config.language || "vi");
      this.publicStatusServer = require("../api/public-status-server")(this);
      this.build();
    });

    //Load Events and stuff
    /**@type {Collection<string, import("./SlashCommand")} */
    this.slashCommands = new Collection();
    this.contextCommands = new Collection();
    this.logger = new Logger(path.join(__dirname, "..", "logs.log"));
    this.LoadCommands();
    this.LoadEvents();
    const dataFolder = path.join(__dirname, "..", "data");
    if (!fs.existsSync(dataFolder)) {
        fs.mkdirSync(dataFolder, { recursive: true });
    }
    this.database = new jsoning("data/db.json");
    this.deletedMessages = new WeakSet();
    this.getLavalink = getLavalink;
    this.getChannel = getChannel;
    this.ms = prettyMilliseconds;
    this.commandsRan = 0;
    this.songsPlayed = 0;
  }

  /**
   * Send an info message
   * @param {string} text
   */
  log(text) {
    this.logger.log(text);
  }

  /**
   * Send an warning message
   * @param {string} text
   */
  warn(text) {
    this.logger.warn(text);
  }

  /**
   * Send an error message
   * @param {string} text
   */
  error(text) {
    this.logger.error(text);
  }

  /**
   * Build em
   */
  build() {
    this.warn(t("system.botStarted"));
    this.login(this.config.token);
    if (this.config.debug === true) {
      this.warn(t("system.debugEnabled"));
      this.warn(t("system.debugWarning"));
      process.on("unhandledRejection", error => console.log(error));
      process.on("uncaughtException", error => console.log(error));
    } else {
      process.on("unhandledRejection", error => {
        console.error("Unhandled Rejection:", error);
      });
      process.on("uncaughtException", error => {
        console.error("Uncaught Exception:", error);
      });
    }
    let client = this;

    /**
     * will hold at most 100 tracks, for the sake of autoqueue
     */
    let playedTracks = [];

    // ==========================================
    // LavalinkManager (lavalink-client v4)
    // ==========================================
    this.manager = new LavalinkManager({
      nodes: this.config.nodes,
      sendToShard: (guildId, payload) => {
        const guild = client.guilds.cache.get(guildId);
        if (guild) guild.shard.send(payload);
      },
      autoSkip: true,
      client: {
        id: this.config.clientId,
        username: "DiscordMusicBot"
      },
      playerOptions: {
        defaultSearchPlatform: this.config.searchEngine || "youtube",
        onDisconnect: {
          autoReconnect: true,
          destroyPlayer: false
        },
        onEmptyQueue: {
          autoPlayFunction: async (player, lastTrack) => {
            const autoQueue = player.get("autoQueue");
            if (!autoQueue) return;
            if (!lastTrack) return;

            // YouTube autoplay - tìm mix dựa trên bài cuối
            const search = `https://www.youtube.com/watch?v=${lastTrack.info.identifier}&list=RD${lastTrack.info.identifier}`;
            const requester = player.get("requester");
            const res = await player.search({
              query: search,
              source: "youtube"
            }, requester).then(response => {
              response.tracks = response.tracks.filter(v => v.info.identifier !== lastTrack.info.identifier && !playedTracks.includes(v.info.identifier));
              return response;
            }).catch(err => {
              client.warn(`AutoQueue error: ${err.message}`);
              return null;
            });
            if (res && res.tracks && res.tracks.length > 0) {
              await player.queue.add(res.tracks.slice(0, 5));
              if (!player.playing && !player.paused) await player.play();
            }
          }
        }
      }
    });

    // ==========================================
    // Node events (via nodeManager)
    // + Gửi thông báo vào kênh /setlog
    // ==========================================
    client.lastLavalinkNotifications = new Map();
    // Hàm gửi thông báo Lavalink → Public trên client để reload/lavalink gọi được
    client.sendLavalinkNotification = async (embed, nodeId = null) => {
      try {
        if (nodeId) {
          const last = client.lastLavalinkNotifications.get(nodeId) || 0;
          // Chống spam: Mỗi node chỉ được thông báo 1 lần mỗi 2 phút (120000ms)
          if (Date.now() - last < 120000) return;
          client.lastLavalinkNotifications.set(nodeId, Date.now());
        }

        const logChannelId = await client.database.get("admin_log_channel");
        if (!logChannelId) {
          client.warn(t("DiscordMusicBot.auto_302"));
          return;
        }
        let logChannel = client.channels.cache.get(logChannelId);
        if (!logChannel) {
          try {
            logChannel = await client.channels.fetch(logChannelId);
          } catch (e) {}
        }
        if (logChannel) {
          await logChannel.send({
            embeds: [embed]
          });
        } else {
          client.warn(t("system.lavalinkNotifyNoChannel", {
            channelId: logChannelId
          }));
        }
      } catch (e) {
        client.warn(t("system.lavalinkNotifyError", {
          error: e.message
        }));
      }
    };
    const sendLavalinkNotification = client.sendLavalinkNotification;

    // Theo dõi trạng thái cuối cùng của mỗi node
    // Chỉ gửi thông báo khi trạng thái THAY ĐỔI (edge-trigger)
    client.lavalinkNodeStates = new Map(); // nodeId → 'connected' | 'disconnected'
    const nodeStates = client.lavalinkNodeStates;

    this.manager.nodeManager.on("connect", node => {
      const h = node.options?.host || "N/A";
      const p = node.options?.port || "N/A";
      const s = node.options?.secure ? "True" : "False";
      this.log(t("system.lavalinkConnected", { id: node.id, host: h, port: p }));
      // Chỉ gửi nếu trước đó KHÔNG phải là connected
      if (nodeStates.get(node.id) === "connected") return;
      nodeStates.set(node.id, "connected");
      sendLavalinkNotification(new EmbedBuilder().setColor("#00FF00").setDescription(t("lavalink.lavalinkConnectedNotify", {
        id: node.id, host: h, port: p, ssl: s
      })).setTimestamp(), node.id);
    }).on("reconnecting", node => this.warn(t("system.lavalinkReconnecting", {
      id: node.id
    }))).on("destroy", node => this.warn(t("system.lavalinkDestroyed", {
      id: node.id
    }))).on("disconnect", node => {
      const h = node.options?.host || "N/A";
      const p = node.options?.port || "N/A";
      const s = node.options?.secure ? "True" : "False";
      this.warn(t("system.lavalinkDisconnected", { id: node.id, host: h, port: p }));

      // Auto-failover: xử lý player
      const affectedPlayers = [...client.manager.players.values()].filter(pl => pl.node?.id === node.id);
      if (affectedPlayers.length > 0) {
        for (const player of affectedPlayers) {
          try {
            const nowPlayingMsg = player.get("nowPlayingMessage");
            if (nowPlayingMsg) nowPlayingMsg.delete().catch(() => {});
            const textChannel = client.channels.cache.get(player.textChannelId);
            if (textChannel) {
              textChannel.send({
                embeds: [new EmbedBuilder().setColor("#FF8800").setDescription(t("error.botUpdated")).setTimestamp()]
              }).catch(() => {});
            }
            player.destroy().catch(() => {});
          } catch (e) {}
        }
      }

      // Chỉ gửi nếu trước đó KHÔNG phải là disconnected
      if (nodeStates.get(node.id) === "disconnected") return;
      nodeStates.set(node.id, "disconnected");
      const aliveNodes = [...client.manager.nodeManager.nodes.values()].filter(n => n.connected);
      let failoverMsg = t("DiscordMusicBot.auto_303", { var1: node.id, var2: h, var3: p, var4: s });
      if (affectedPlayers.length > 0) failoverMsg += t("DiscordMusicBot.auto_304", { var1: affectedPlayers.length });
      if (aliveNodes.length > 0) {
        failoverMsg += t("DiscordMusicBot.auto_305", { var1: aliveNodes.map(n => `\`${n.id}\``).join(", ") });
        failoverMsg += t("DiscordMusicBot.auto_306");
      } else {
        failoverMsg += t("DiscordMusicBot.auto_307");
      }
      sendLavalinkNotification(new EmbedBuilder().setColor("#FF0000").setDescription(failoverMsg).setTimestamp(), node.id);
    }).on("error", (node, err) => {
      this.warn(t("system.lavalinkError", { id: node.id, error: err.message }));
      // Lỗi chỉ gửi khi node chưa ở trạng thái disconnected (tránh spam kèm disconnect)
      if (nodeStates.get(node.id) === "disconnected") return;
      nodeStates.set(node.id, "disconnected");
      sendLavalinkNotification(new EmbedBuilder().setColor("#FF8800").setDescription(t("lavalink.lavalinkErrorNotify", {
        id: node.id, error: err.message
      })).setTimestamp(), node.id);
    });

    // ==========================================
    // Player events (via manager)
    // ==========================================

    // on track error warn and create embed
    this.manager.on("trackError", (player, track, payload) => {
      this.warn(t("DiscordMusicBot.auto_308", {
        var1: player.guildId,
        var2: payload?.exception?.message || "Unknown error"
      }));
      let title = track ? escapeMarkdown(track.info.title) : "Unknown";
      title = title.replace(/\]/g, "").replace(/\[/g, "");
      let errorEmbed = new EmbedBuilder().setColor(0xFF0000).setTitle(t("error.trackErrorTitle")).setDescription(t("error.trackErrorDesc", {
        title
      })).setFooter({
        text: t("error.trackErrorFooter")
      });
      const channel = client.channels.cache.get(player.textChannelId);
      if (channel) {
        channel.send({
          embeds: [errorEmbed]
        }).then(msg => setTimeout(() => msg.delete().catch(() => {}), 30000));
      }
    }).on("trackStuck", (player, track) => {
      this.warn(t("system.trackStuck", {
        title: track?.info?.title || "Unknown"
      }));
      let title = track ? escapeMarkdown(track.info.title) : "Unknown";
      title = title.replace(/\]/g, "").replace(/\[/g, "");
      let errorEmbed = new EmbedBuilder().setColor(0xFF0000).setTitle(t("error.trackStuckTitle")).setDescription(t("error.trackErrorDesc", {
        title
      })).setFooter({
        text: t("error.trackStuckFooter")
      });
      const channel = client.channels.cache.get(player.textChannelId);
      if (channel) {
        channel.send({
          embeds: [errorEmbed]
        }).then(msg => setTimeout(() => msg.delete().catch(() => {}), 30000));
      }
    }).on("playerMove", (player, oldChannel, newChannel) => {
      const guild = client.guilds.cache.get(player.guildId);
      if (!guild) return;
      const channel = guild.channels.cache.get(player.textChannelId);
      if (oldChannel === newChannel) return;
      if (newChannel === null || !newChannel) {
        if (!player) return;
        if (channel) {
          channel.send({
            embeds: [new EmbedBuilder().setColor(client.config.embedColor).setDescription(t("queue.disconnectedFromChannel", {
              channel: oldChannel
            }))]
          }).then(msg => setTimeout(() => msg.delete().catch(() => {}), 30000));
        }
        return player.destroy();
      } else {
        player.voiceChannelId = newChannel;
        setTimeout(() => player.resume(), 1000);
        return undefined;
      }
    }).on("playerCreate", player => {
      player.set("twentyFourSeven", client.config.twentyFourSeven);
      player.set("autoQueue", client.config.autoQueue);
      player.set("autoPause", client.config.autoPause);
      player.set("autoLeave", client.config.autoLeave);
      // Áp dụng âm lượng mặc định từ config
      if (client.config.defaultVolume) {
        player.setVolume(client.config.defaultVolume);
      }
      this.warn(t("DiscordMusicBot.auto_309", {
        var1: player.guildId,
        var2: client.guilds.cache.get(player.guildId) ? client.guilds.cache.get(player.guildId).name : "một máy chủ"
      }));
    }).on("playerDestroy", player => {
      // Clear update interval
      const updateInterval = player.get("updateTimeInterval");
      if (updateInterval) clearInterval(updateInterval);
      this.warn(t("DiscordMusicBot.auto_310", {
        var1: player.guildId,
        var2: client.guilds.cache.get(player.guildId) ? client.guilds.cache.get(player.guildId).name : "một máy chủ"
      }));
      // Delete now playing message
      deleteNowPlayingMessage(client, player);
    })

    // on TRACK_START send or edit message
    .on("trackStart", async (player, track) => {
      // Clear previous update interval
      const prevInterval = player.get("updateTimeInterval");
      if (prevInterval) clearInterval(prevInterval);

      // Huỷ bỏ timer disconnect cũ (nếu có) để tránh tin nhắn treo
      const oldDisconnectTimer = player.get("disconnectTimer");
      if (oldDisconnectTimer) clearTimeout(oldDisconnectTimer);
      player.set("disconnectTimer", null);

      // Nếu có tin nhắn cũ đang treo (từ lượt Stop trước), xoá nó đi
      if (player.get("forceNewMessage")) {
        const oldMsg = player.get("nowPlayingMessage");
        if (oldMsg && !client.isMessageDeleted(oldMsg)) {
          oldMsg.delete().catch(() => {});
          client.markMessageAsDeleted(oldMsg);
        }
        player.set("nowPlayingMessage", null);
      }
      client.setVoiceStatus(player.voiceChannelId, `🎵 ${track.info.title}`.substring(0, 175));
      this.songsPlayed++;
      playedTracks.push(track.info.identifier);
      if (playedTracks.length >= 100) {
        playedTracks.shift();
      }
      this.warn(t("DiscordMusicBot.auto_311", {
        var1: player.guildId,
        var2: colors.blue(track.info.title)
      }));
      let title = escapeMarkdown(track.info.title);
      title = title.replace(/\]/g, "").replace(/\[/g, "");
      const buildNowPlayingEmbed = () => {
        let embed = client.Embed().setAuthor({
          name: t("player.nowPlaying"),
          iconURL: client.config.iconURL
        }).setDescription(`[${title}](${track.info.uri})` || t("player.noDescription")).addFields({
          name: t("player.requestedBy"),
          value: `${track.requester ? `<@${track.requester.id || track.requester}>` : `<@${client.user.id}>`}`,
          inline: true
        }, {
          name: t("player.duration"),
          value: track.info.isStream ? `\`LIVE\`` : `\`${formatTime(player.position)} / ${formatTime(track.info.duration)}\``,
          inline: true
        });
        if (track.info.artworkUrl) {
          embed.setThumbnail(track.info.artworkUrl);
        }
        return embed;
      };
      const messagePayload = {
        embeds: [buildNowPlayingEmbed()],
        components: client.createController(player.guildId, player)
      };

      // Try to edit existing now playing message, fallback to sending new one
      const existingMsg = player.get("nowPlayingMessage");
      const forceNew = player.get("forceNewMessage");
      let nowPlaying = null;
      if (!forceNew && existingMsg && !client.isMessageDeleted(existingMsg)) {
        try {
          nowPlaying = await existingMsg.edit(messagePayload);
        } catch {
          // Edit failed (message deleted externally, etc.), send new one
          nowPlaying = await client.channels.cache.get(player.textChannelId)?.send(messagePayload).catch(e => client.warn(e));
        }
      } else {
        nowPlaying = await client.channels.cache.get(player.textChannelId)?.send(messagePayload).catch(e => client.warn(e));
        // Xoá cờ sau khi đã tạo tin nhắn mới
        player.set("forceNewMessage", false);
      }

      // Store now playing message
      if (nowPlaying) {
        player.set("nowPlayingMessage", nowPlaying);
      }

      // Start interval to update playback time every 10 seconds
      if (!track.info.isStream) {
        const interval = setInterval(async () => {
          try {
            const msg = player.get("nowPlayingMessage");
            if (!msg || client.isMessageDeleted(msg) || !player.playing) {
              clearInterval(interval);
              return;
            }
            await msg.edit({
              embeds: [buildNowPlayingEmbed()],
              components: client.createController(player.guildId, player)
            });
          } catch {
            clearInterval(interval);
          }
        }, 10000);
        player.set("updateTimeInterval", interval);
      }
    }).on("playerDisconnect", async player => {
      // Clear update interval
      const updateInterval = player.get("updateTimeInterval");
      if (updateInterval) clearInterval(updateInterval);
      client.setVoiceStatus(player.voiceChannelId, null);
      const twentyFourSeven = player.get("twentyFourSeven");
      if (twentyFourSeven) {
        player.queue.tracks.splice(0);
        player.stopPlaying(false, false);
        player.set("autoQueue", false);
      } else {
        player.destroy();
      }
    }).on("queueEnd", async (player, track) => {
      // Clear update interval
      const updateInterval = player.get("updateTimeInterval");
      if (updateInterval) clearInterval(updateInterval);
      client.setVoiceStatus(player.voiceChannelId, null);
      const autoQueue = player.get("autoQueue");
      const tracksAdded = player.queue.tracks.length > 0;

      // Nếu không có autoQueue hoặc autoQueue không tìm thấy bài hát nào mới
      if (!autoQueue || !tracksAdded) {
        const twentyFourSeven = player.get("twentyFourSeven");
        const showQueueEndAndDisconnect = async () => {
          let queueEmbed = new EmbedBuilder().setColor(client.config.embedColor).setAuthor({
            name: t("queue.ended"),
            iconURL: client.config.iconURL
          }).setFooter({
            text: t("queue.ended")
          }).setTimestamp();

          // Sửa tin nhắn thành t("queue.ended") 
          const existingMsg = player.get("nowPlayingMessage");
          let statusMsg = null;
          if (existingMsg && !client.isMessageDeleted(existingMsg)) {
            try {
              statusMsg = await existingMsg.edit({
                embeds: [queueEmbed],
                components: []
              });
            } catch {
              const textChannel = client.channels.cache.get(player.textChannelId);
              if (textChannel) statusMsg = await textChannel.send({
                embeds: [queueEmbed]
              }).catch(() => null);
            }
          } else {
            const textChannel = client.channels.cache.get(player.textChannelId);
            if (textChannel) statusMsg = await textChannel.send({
              embeds: [queueEmbed]
            }).catch(() => null);
          }
          player.set("nowPlayingMessage", statusMsg);
          try {
            if (!player.playing && !twentyFourSeven) {
              const disconnectTimeout = setTimeout(async () => {
                if (!player.playing && player.connected) {
                  let disconnectedEmbed = new EmbedBuilder().setColor(client.config.embedColor).setAuthor({
                    name: t("voice.disconnected"),
                    iconURL: client.config.iconURL
                  }).setDescription(t("voice.disconnectedInactivity"));
                  const currentMsg = player.get("nowPlayingMessage");
                  if (currentMsg && !client.isMessageDeleted(currentMsg)) {
                    try {
                      const m = await currentMsg.edit({
                        embeds: [disconnectedEmbed],
                        components: []
                      });
                      setTimeout(() => m.delete().catch(() => {}), 5000);
                    } catch {
                      const ch = client.channels.cache.get(player.textChannelId);
                      if (ch) ch.send({
                        embeds: [disconnectedEmbed]
                      }).then(m => setTimeout(() => m.delete().catch(() => {}), 5000)).catch(() => {});
                    }
                  } else {
                    const ch = client.channels.cache.get(player.textChannelId);
                    if (ch) ch.send({
                      embeds: [disconnectedEmbed]
                    }).then(m => setTimeout(() => m.delete().catch(() => {}), 5000)).catch(() => {});
                  }
                  player.destroy();
                }
              }, client.config.disconnectTime);
              // Lưu lại timer ID để có thể huỷ nếu user /play bài mới
              player.set("disconnectTimer", disconnectTimeout);
            }
          } catch (err) {
            client.error(err);
          }
        };
        if (player.get("stoppedByUser")) {
          player.set("stoppedByUser", false);
          // Đánh cờ: lần /play tiếp theo phải tạo tin nhắn mới, không edit lại tin nhắn Stop cũ
          player.set("forceNewMessage", true);
          let stopEmbed = new EmbedBuilder().setColor(client.config.embedColor).setAuthor({
            name: t("player.stoppedAuthor")
          });
          const existingMsg = player.get("nowPlayingMessage");
          if (existingMsg && !client.isMessageDeleted(existingMsg)) {
            await existingMsg.edit({
              embeds: [stopEmbed],
              components: []
            }).catch(() => {});
          }
          // Delay 5 seconds then show queue end logic
          setTimeout(() => {
            showQueueEndAndDisconnect();
          }, 5000);
        } else {
          showQueueEndAndDisconnect();
        }
      }
    });
  }

  /**
   * Đặt trạng thái cho voice channel hiện tại khi phát bài
   * Gửi trực tiếp thông tin vào endpoint channel voice-status
   */
  async setVoiceStatus(channelId, message) {
    if (!channelId) return;
    const status = message && message.trim().length > 0 ? message : null;
    try {
      await this.rest.put(`/channels/${channelId}/voice-status`, {
        body: {
          status
        }
      });
    } catch (error) {
      this.warn(t("system.voiceStatusError", {
        error: error.message || error
      }));
    }
  }

  /**
   * Checks if a message has been deleted during the run time of the Bot
   * @param {Message} message
   * @returns
   */
  isMessageDeleted(message) {
    return this.deletedMessages.has(message);
  }

  /**
   * Marks (adds) a message on the client's `deletedMessages` WeakSet so it's
   * state can be seen through the code
   * @param {Message} message
   */
  markMessageAsDeleted(message) {
    this.deletedMessages.add(message);
  }

  /**
   *
   * @param {string} text
   * @returns {EmbedBuilder}
   */
  Embed(text) {
    let embed = new EmbedBuilder().setColor(this.config.embedColor);
    if (text) {
      embed.setDescription(text);
    }
    return embed;
  }

  /**
   *
   * @param {string} text
   * @returns {EmbedBuilder}
   */
  ErrorEmbed(text) {
    let embed = new EmbedBuilder().setColor(0xFF0000).setDescription("❌ | " + text);
    return embed;
  }
  LoadEvents() {
    let EventsDir = path.join(__dirname, "..", "events");
    fs.readdir(EventsDir, (err, files) => {
      if (err) {
        throw err;
      } else {
        files.forEach(file => {
          const event = require(EventsDir + "/" + file);
          this.on(file.split(".")[0], event.bind(null, this));
          this.warn(t("system.eventLoaded", {
            name: file.split(".")[0]
          }));
        });
      }
    });
  }
  LoadCommands() {
    let SlashCommandsDirectory = path.join(__dirname, "..", "commands", "slash");
    fs.readdir(SlashCommandsDirectory, (err, files) => {
      if (err) {
        throw err;
      } else {
        files.forEach(file => {
          let cmd = require(SlashCommandsDirectory + "/" + file);
          if (!cmd || !cmd.run) {
            return this.warn(t("DiscordMusicBot.auto_312") + file.split(".")[0] + t("DiscordMusicBot.auto_313"));
          }
          if (cmd.disabled) {
            return;
          }
          this.slashCommands.set(file.split(".")[0].toLowerCase(), cmd);
          this.log("Slash Command Loaded: " + file.split(".")[0]);
        });
      }
    });
    let ContextCommandsDirectory = path.join(__dirname, "..", "commands", "context");
    fs.readdir(ContextCommandsDirectory, (err, files) => {
      if (err) {
        throw err;
      } else {
        files.forEach(file => {
          let cmd = require(ContextCommandsDirectory + "/" + file);
          if (!cmd.command || !cmd.run) {
            return this.warn(t("DiscordMusicBot.auto_314") + file.split(".")[0] + t("DiscordMusicBot.auto_315"));
          }
          this.contextCommands.set(file.split(".")[0].toLowerCase(), cmd);
          this.log("ContextMenu Loaded: " + file.split(".")[0]);
        });
      }
    });
  }

  /**
   *
   * @param {import("discord.js").TextChannel} textChannel
   * @param {import("discord.js").VoiceChannel} voiceChannel
   */
  createPlayer(textChannel, voiceChannel, node) {
    return this.manager.createPlayer({
      guildId: textChannel.guild.id,
      voiceChannelId: voiceChannel.id,
      textChannelId: textChannel.id,
      selfDeaf: this.config.serverDeafen,
      selfMute: false,
      node: node ? node.id : undefined
    });
  }
  createController(guild, player) {
    const rows = [];

    // Row 1: Điều khiển phát nhạc (Lùi / Play–Pause / Tiến)
    const row1 = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setStyle(ButtonStyle.Primary).setCustomId(`controller:${guild}:Replay`).setEmoji("⏮️"),
      new ButtonBuilder().setStyle(player.playing ? ButtonStyle.Primary : ButtonStyle.Danger).setCustomId(`controller:${guild}:PlayAndPause`).setEmoji(player.playing ? "⏸️" : "▶️"),
      new ButtonBuilder().setStyle(ButtonStyle.Primary).setCustomId(`controller:${guild}:Next`).setEmoji("⏭️")
    );

    // Row 2: Stop / Loop / Save
    const row2 = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setStyle(ButtonStyle.Danger).setCustomId(`controller:${guild}:Stop`).setEmoji("⏹️"),
      new ButtonBuilder().setStyle(player.repeatMode !== "off" ? ButtonStyle.Success : ButtonStyle.Secondary).setCustomId(`controller:${guild}:Loop`).setEmoji(player.repeatMode === "track" ? "🔂" : "🔁"),
      new ButtonBuilder().setStyle(ButtonStyle.Secondary).setCustomId(`controller:${guild}:Save`).setEmoji("⭐")
    );

    rows.push(row1, row2);

    // Row 3: Select Menu hàng đợi (chỉ hiển khi có bài đang chờ)
    const queueTracks = player.queue?.tracks;
    if (queueTracks && queueTracks.length > 0) {
      const options = queueTracks.slice(0, 25).map((track, index) => {
        const label = (track.info.title || "Unknown").substring(0, 100);
        const author = (track.info.author || "").substring(0, 50);
        const description = author ? `${author}`.substring(0, 100) : undefined;
        return {
          label,
          value: `queuejump:${index}`,
          description,
          emoji: "🎵"
        };
      });
      const selectMenu = new StringSelectMenuBuilder()
        .setCustomId(`controller:${guild}:SelectQueue`)
        .setPlaceholder(`📋 Hàng đợi (${queueTracks.length} bài) – Chọn để nhảy đến bài`)
        .setMaxValues(1)
        .addOptions(options);
      rows.push(new ActionRowBuilder().addComponents(selectMenu));
    }

    return rows;
  }
}

/**
 * Helper to delete the now playing message
 */
function deleteNowPlayingMessage(client, player) {
  const msg = player.get("nowPlayingMessage");
  if (msg && !client.isMessageDeleted(msg)) {
    // Xoá buttons khỏi message trước khi xoá (hoặc khi destroy mà không qua queueEnd)
    msg.edit({
      components: []
    }).catch(() => {});
    client.markMessageAsDeleted(msg);
  }
  player.set("nowPlayingMessage", null);
}
module.exports = DiscordMusicBot;