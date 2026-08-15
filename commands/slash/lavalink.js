const SlashCommand = require("../../lib/SlashCommand");
const {
  EmbedBuilder
} = require("discord.js");
const {
  t
} = require("../../util/i18n");
const path = require("path");
const fs = require("fs");
const MAX_NODES = 10;

// ====== HELPER: Ghi nodes vào config.js ======
function writeNodesToConfig(nodes) {
  const configPath = path.resolve(__dirname, "..", "..", "config.js");
  let content = fs.readFileSync(configPath, "utf8");

  // Build nodes string
  const nodesStr = nodes.map((n, i) => {
    return `\t\t{
\t\t\tid: "${n.id}",
\t\t\thost: "${n.host}",
\t\t\tport: ${n.port},
\t\t\tauthorization: "${n.authorization}",
\t\t\tretryAmount: ${n.retryAmount || 200},
\t\t\tretryDelay: ${n.retryDelay || 40},
\t\t\tsecure: ${n.secure || false},
\t\t\trequestTimeout: ${n.requestTimeout || 60000},
\t\t}`;
  }).join(",\n");

  // Replace nodes array in config
  content = content.replace(/nodes:\s*\[[\s\S]*?\n\t\],/, `nodes: [\n${nodesStr},\n\t],`);
  fs.writeFileSync(configPath, content, "utf8");
}

// ====== HELPER: Tìm slot ID trống nhỏ nhất ======
function findNextNodeId(existingNodes) {
  for (let i = 1; i < MAX_NODES; i++) {
    const id = `node${i}`;
    if (!existingNodes.find(n => n.id === id)) return id;
  }
  return null;
}

// ====== HELPER: Ping test 1 node ======
async function pingNode(host, port, password, secure) {
  const proto = secure ? "https" : "http";
  const url = `${proto}://${host}:${port}/v4/info`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  const startTime = Date.now();
  try {
    const res = await fetch(url, {
      headers: {
        Authorization: password
      },
      signal: controller.signal
    });
    clearTimeout(timeout);
    const latency = Date.now() - startTime;
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return {
      success: true,
      data,
      latency
    };
  } catch (err) {
    clearTimeout(timeout);
    return {
      success: false,
      error: err.message
    };
  }
}
const command = new SlashCommand().setName("lavalink").setDescription(t("lavalink.auto_79")).setAdminOnly(true).addStringOption(option => option.setName("action").setDescription(t("lavalink.auto_80")).setRequired(true).addChoices({
  name: t("lavalink.auto_81"),
  value: "list"
}, {
  name: t("lavalink.auto_82"),
  value: "add"
}, {
  name: t("lavalink.auto_83"),
  value: "remove"
}, {
  name: t("lavalink.auto_84"),
  value: "replace"
}, {
  name: "🔍 test — Test 1 node",
  value: "test"
}, {
  name: t("lavalink.auto_85"),
  value: "reload"
})).addStringOption(option => option.setName("host").setDescription(t("lavalink.auto_86")).setRequired(false)).addIntegerOption(option => option.setName("port").setDescription(t("lavalink.auto_87")).setRequired(false)).addStringOption(option => option.setName("password").setDescription(t("lavalink.auto_88")).setRequired(false)).addBooleanOption(option => option.setName("secure").setDescription(t("lavalink.auto_89")).setRequired(false)).addStringOption(option => option.setName("idnode").setDescription(t("lavalink.auto_90")).setRequired(false)).setRun(async (client, interaction, options) => {
  if (interaction.user.id !== client.config.adminId) {
    return interaction.reply({
      embeds: [client.ErrorEmbed(t("lavalink.auto_91"))],
      ephemeral: true
    });
  }
  await interaction.deferReply({
    ephemeral: true
  });
  const action = options.getString("action");

  // ================================================================
  // ACTION: LIST
  // ================================================================
  if (action === "list") {
    const configNodes = client.config.nodes || [];
    const liveNodes = client.manager.nodeManager.nodes;
    if (configNodes.length === 0) {
      return interaction.editReply({
        embeds: [new EmbedBuilder().setColor("#FF0000").setDescription(t("lavalink.noNodes"))]
      });
    }
    let desc = t("lavalink.auto_92", {
      var1: configNodes.length,
      var2: MAX_NODES
    });
    for (const cfg of configNodes) {
      const liveNode = liveNodes.get(cfg.id);
      const isConnected = liveNode?.connected;
      const icon = isConnected ? "🟢" : "🔴";
      desc += `${icon} **${cfg.id}** | \`${cfg.host}:${cfg.port}\` | ${cfg.secure ? "SSL" : "Non-SSL"}`;
      if (isConnected && liveNode.stats) {
        desc += ` | Players: ${liveNode.stats.playingPlayers}/${liveNode.stats.players}`;
      } else if (!isConnected) {
        desc += t("lavalink.auto_93");
      }
      desc += `\n`;
    }
    const embed = new EmbedBuilder().setColor(client.config.embedColor).setDescription(desc).setTimestamp();
    return interaction.editReply({
      embeds: [embed]
    });
  }

  // ================================================================
  // ACTION: TEST
  // ================================================================
  if (action === "test") {
    const host = options.getString("host")?.trim();
    const port = options.getInteger("port");
    const password = options.getString("password");
    const secure = options.getBoolean("secure") ?? false;
    if (!host || !port || !password) {
      return interaction.editReply({
        embeds: [new EmbedBuilder().setColor("#FF0000").setDescription(t("lavalink.requiredFields"))]
      });
    }
    const proto = secure ? "https" : "http";
    await interaction.editReply({
      embeds: [new EmbedBuilder().setColor("#FFAA00").setDescription(t("lavalink.auto_94", {
        var1: proto,
        var2: host,
        var3: port
      }))]
    });
    const result = await pingNode(host, port, password, secure);
    if (result.success) {
      const d = result.data;
      const embed = new EmbedBuilder().setColor("#00FF00").setDescription(`✅ **Lavalink Online!**\n` + `**Host:** \`${host}:${port}\` (${secure ? "SSL" : "Non-SSL"})\n` + `**Version:** ${d.version?.semver || "N/A"}\n` + `**Latency:** ${result.latency}ms\n` + `**Sources:** ${d.sourceManagers?.join(", ") || "N/A"}`).setTimestamp();
      const {
        ActionRowBuilder,
        ButtonBuilder,
        ButtonStyle
      } = require("discord.js");
      const addBtn = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId("lavalink_test_add").setLabel(t("lavalink.auto_95")).setStyle(ButtonStyle.Success));
      const msg = await interaction.editReply({
        embeds: [embed],
        components: [addBtn]
      });
      const collector = msg.createMessageComponentCollector({
        time: 60000
      });
      collector.on("collect", async btn => {
        if (btn.user.id !== interaction.user.id) {
          return btn.reply({
            content: t("lavalink.auto_96"),
            ephemeral: true
          });
        }
        if (btn.customId === "lavalink_test_add") {
          collector.stop("added");
          await btn.deferUpdate();
          const configNodes = client.config.nodes || [];
          if (configNodes.length >= MAX_NODES) {
            return interaction.editReply({
              embeds: [new EmbedBuilder().setColor("#FF0000").setDescription(t("lavalink.maxNodes", {
                max: MAX_NODES
              }))],
              components: []
            });
          }
          if (configNodes.find(n => n.host === host && n.port === port)) {
            return interaction.editReply({
              embeds: [new EmbedBuilder().setColor("#FF0000").setDescription(t("lavalink.auto_97", {
                var1: host,
                var2: port
              }))],
              components: []
            });
          }
          const newId = findNextNodeId(configNodes);
          if (!newId) return interaction.editReply({
            embeds: [new EmbedBuilder().setColor("#FF0000").setDescription(t("lavalink.noSlotAvailable"))],
            components: []
          });
          const newNodeConfig = {
            id: newId,
            host,
            port,
            authorization: password,
            retryAmount: 200,
            retryDelay: 40,
            secure,
            requestTimeout: 60000
          };
          configNodes.push(newNodeConfig);
          try {
            writeNodesToConfig(configNodes);
            client.config.nodes = configNodes;
            client.manager.options.nodes = configNodes;
            client.manager.nodeManager.createNode(newNodeConfig);
            await client.manager.nodeManager.connectAll();
            if (client.lavalinkNotified) client.lavalinkNotified.delete(newId);
            const succEmbed = new EmbedBuilder().setColor("#00FF00").setDescription(t("lavalink.auto_98", {
              var1: newId,
              var2: host,
              var3: port,
              var4: secure ? "SSL" : "Non-SSL",
              var5: configNodes.length,
              var6: MAX_NODES
            })).setTimestamp();
            await interaction.editReply({
              embeds: [succEmbed],
              components: []
            });
            if (client.sendLavalinkNotification) {
              client.sendLavalinkNotification(new EmbedBuilder().setColor("#00FF00").setDescription(t("lavalink.auto_99", {
                var1: newId,
                var2: host,
                var3: port,
                var4: configNodes.length
              })).setTimestamp());
            }
          } catch (err) {
            return interaction.editReply({
              embeds: [new EmbedBuilder().setColor("#FF0000").setDescription(t("lavalink.errorGeneric", {
                error: err.message
              }))],
              components: []
            });
          }
        }
      });
      collector.on("end", (_, reason) => {
        if (reason === "time") interaction.editReply({
          components: []
        }).catch(() => {});
      });
      return;
    } else {
      const embed = new EmbedBuilder().setColor("#FF0000").setDescription(t("lavalink.auto_100") + `**Host:** \`${host}:${port}\`\n` + t("lavalink.auto_101", {
        var1: result.error
      })).setTimestamp();
      return interaction.editReply({
        embeds: [embed]
      });
    }
  }

  // ================================================================
  // ACTION: ADD
  // ================================================================
  if (action === "add") {
    const host = options.getString("host")?.trim();
    const port = options.getInteger("port");
    const password = options.getString("password");
    const secure = options.getBoolean("secure") ?? false;
    if (!host || !port || !password) {
      return interaction.editReply({
        embeds: [new EmbedBuilder().setColor("#FF0000").setDescription(t("lavalink.requiredFields"))]
      });
    }
    const configNodes = client.config.nodes || [];

    // Kiểm tra giới hạn
    if (configNodes.length >= MAX_NODES) {
      return interaction.editReply({
        embeds: [new EmbedBuilder().setColor("#FF0000").setDescription(t("lavalink.auto_102", {
          var1: MAX_NODES
        }))]
      });
    }

    // Kiểm tra trùng host
    if (configNodes.find(n => n.host === host && n.port === port)) {
      return interaction.editReply({
        embeds: [new EmbedBuilder().setColor("#FF0000").setDescription(t("lavalink.auto_103", {
          var1: host,
          var2: port
        }))]
      });
    }

    // Test trước khi thêm
    await interaction.editReply({
      embeds: [new EmbedBuilder().setColor("#FFAA00").setDescription(t("lavalink.testingBeforeAdd", {
        host,
        port
      }))]
    });
    const result = await pingNode(host, port, password, secure);
    if (!result.success) {
      return interaction.editReply({
        embeds: [new EmbedBuilder().setColor("#FF0000").setDescription(t("lavalink.auto_104") + `**Host:** \`${host}:${port}\`\n` + t("lavalink.auto_105", {
          var1: result.error
        }) + t("lavalink.auto_106"))]
      });
    }

    // Tìm ID mới
    const newId = findNextNodeId(configNodes);
    if (!newId) {
      return interaction.editReply({
        embeds: [new EmbedBuilder().setColor("#FF0000").setDescription(t("lavalink.noSlotAvailable"))]
      });
    }

    // Thêm vào config
    const newNodeConfig = {
      id: newId,
      host,
      port,
      authorization: password,
      retryAmount: 200,
      retryDelay: 40,
      secure,
      requestTimeout: 60000
    };
    configNodes.push(newNodeConfig);
    try {
      // Ghi file config
      writeNodesToConfig(configNodes);

      // Cập nhật runtime config
      client.config.nodes = configNodes;
      client.manager.options.nodes = configNodes;

      // Tạo + kết nối node mới
      client.manager.nodeManager.createNode(newNodeConfig);
      await client.manager.nodeManager.connectAll();

      // Reset cờ thông báo
      if (client.lavalinkNotified) client.lavalinkNotified.delete(newId);
      const embed = new EmbedBuilder().setColor("#00FF00").setDescription(t("lavalink.auto_107") + `**ID:** \`${newId}\`\n` + `**Host:** \`${host}:${port}\` (${secure ? "SSL" : "Non-SSL"})\n` + `**Latency:** ${result.latency}ms\n` + t("lavalink.auto_108", {
        var1: configNodes.length,
        var2: MAX_NODES
      })).setTimestamp();
      await interaction.editReply({
        embeds: [embed]
      });

      // Thông báo kênh setlog
      if (client.sendLavalinkNotification) {
        client.sendLavalinkNotification(new EmbedBuilder().setColor("#00FF00").setDescription(t("lavalink.auto_109") + `**ID:** \`${newId}\` | **Host:** \`${host}:${port}\`\n` + t("lavalink.auto_110", {
          var1: configNodes.length
        })).setTimestamp());
      }
    } catch (err) {
      return interaction.editReply({
        embeds: [new EmbedBuilder().setColor("#FF0000").setDescription(t("lavalink.errorGeneric", {
          error: err.message
        }))]
      });
    }
  }

  // ================================================================
  // ACTION: REMOVE
  // ================================================================
  if (action === "remove") {
    const idnode = options.getString("idnode")?.trim().toLowerCase();
    if (!idnode) {
      return interaction.editReply({
        embeds: [new EmbedBuilder().setColor("#FF0000").setDescription(t("lavalink.requiredIdnode"))]
      });
    }

    // Không cho xoá node0
    if (idnode === "node0") {
      return interaction.editReply({
        embeds: [new EmbedBuilder().setColor("#FF0000").setDescription(t("lavalink.cannotRemoveNode0"))]
      });
    }
    const configNodes = client.config.nodes || [];
    const nodeIndex = configNodes.findIndex(n => n.id.toLowerCase() === idnode);
    if (nodeIndex === -1) {
      const available = configNodes.map(n => `\`${n.id}\``).join(", ");
      return interaction.editReply({
        embeds: [new EmbedBuilder().setColor("#FF0000").setDescription(t("lavalink.auto_111", {
          var1: idnode,
          var2: available
        }))]
      });
    }
    const removedNode = configNodes[nodeIndex];
    try {
      // Xoá player đang chạy trên node này
      const playersOnNode = [...client.manager.players.values()].filter(p => p.node?.id?.toLowerCase() === idnode);
      for (const player of playersOnNode) {
        try {
          const nowPlayingMsg = player.get("nowPlayingMessage");
          if (nowPlayingMsg) await nowPlayingMsg.delete().catch(() => {});
          const textChannel = client.channels.cache.get(player.textChannelId);
          if (textChannel) {
            await textChannel.send({
              embeds: [new EmbedBuilder().setColor("#FF8800").setDescription(t("error.botUpdated")).setTimestamp()]
            }).catch(() => {});
          }
          await player.destroy().catch(() => {});
        } catch (e) {}
      }

      // Ngắt kết nối node
      const liveNode = client.manager.nodeManager.nodes.get(removedNode.id);
      if (liveNode) {
        try {
          await liveNode.destroy();
        } catch (e) {
          client.manager.nodeManager.nodes.delete(removedNode.id);
        }
      }

      // Xoá khỏi config
      configNodes.splice(nodeIndex, 1);
      writeNodesToConfig(configNodes);
      client.config.nodes = configNodes;
      client.manager.options.nodes = configNodes;

      // Xoá cờ thông báo
      if (client.lavalinkNotified) client.lavalinkNotified.delete(removedNode.id);
      const embed = new EmbedBuilder().setColor("#00FF00").setDescription(t("lavalink.auto_112") + `**ID:** \`${removedNode.id}\`\n` + `**Host:** \`${removedNode.host}:${removedNode.port}\`\n` + (playersOnNode.length > 0 ? t("lavalink.auto_113", {
        var1: playersOnNode.length
      }) : "") + t("lavalink.auto_114", {
        var1: configNodes.length,
        var2: MAX_NODES
      })).setTimestamp();
      await interaction.editReply({
        embeds: [embed]
      });

      // Thông báo kênh setlog
      if (client.sendLavalinkNotification) {
        client.sendLavalinkNotification(new EmbedBuilder().setColor("#FF0000").setDescription(t("lavalink.auto_115") + `**ID:** \`${removedNode.id}\` | **Host:** \`${removedNode.host}:${removedNode.port}\`\n` + t("lavalink.auto_116", {
          var1: configNodes.length
        })).setTimestamp());
      }
    } catch (err) {
      return interaction.editReply({
        embeds: [new EmbedBuilder().setColor("#FF0000").setDescription(t("lavalink.errorGeneric", {
          error: err.message
        }))]
      });
    }
  }

  // ================================================================
  // ACTION: REPLACE
  // ================================================================
  if (action === "replace") {
    const idnode = options.getString("idnode")?.trim().toLowerCase();
    const host = options.getString("host")?.trim();
    const port = options.getInteger("port");
    const password = options.getString("password");
    const secure = options.getBoolean("secure") ?? false;
    if (!idnode) {
      return interaction.editReply({
        embeds: [new EmbedBuilder().setColor("#FF0000").setDescription(t("lavalink.requiredIdnodeReplace"))]
      });
    }
    if (!host || !port || !password) {
      return interaction.editReply({
        embeds: [new EmbedBuilder().setColor("#FF0000").setDescription(t("lavalink.requiredFieldsReplace"))]
      });
    }
    const configNodes = client.config.nodes || [];
    const nodeIndex = configNodes.findIndex(n => n.id.toLowerCase() === idnode);
    if (nodeIndex === -1) {
      const available = configNodes.map(n => `\`${n.id}\``).join(", ");
      return interaction.editReply({
        embeds: [new EmbedBuilder().setColor("#FF0000").setDescription(t("lavalink.auto_117", {
          var1: idnode,
          var2: available
        }))]
      });
    }
    const oldNode = configNodes[nodeIndex];

    // Test node mới trước
    await interaction.editReply({
      embeds: [new EmbedBuilder().setColor("#FFAA00").setDescription(t("lavalink.testingBeforeReplace", {
        host,
        port,
        id: oldNode.id
      }))]
    });
    const result = await pingNode(host, port, password, secure);
    if (!result.success) {
      return interaction.editReply({
        embeds: [new EmbedBuilder().setColor("#FF0000").setDescription(t("lavalink.auto_118") + `**Host:** \`${host}:${port}\`\n` + t("lavalink.auto_119", {
          var1: result.error
        }) + t("lavalink.auto_120", {
          var1: oldNode.id
        }))]
      });
    }
    try {
      // Xoá player đang chạy trên node cũ
      const playersOnNode = [...client.manager.players.values()].filter(p => p.node?.id?.toLowerCase() === idnode);
      for (const player of playersOnNode) {
        try {
          const nowPlayingMsg = player.get("nowPlayingMessage");
          if (nowPlayingMsg) await nowPlayingMsg.delete().catch(() => {});
          const textChannel = client.channels.cache.get(player.textChannelId);
          if (textChannel) {
            await textChannel.send({
              embeds: [new EmbedBuilder().setColor("#FF8800").setDescription(t("error.serverReplaced")).setTimestamp()]
            }).catch(() => {});
          }
          await player.destroy().catch(() => {});
        } catch (e) {}
      }

      // Ngắt kết nối node cũ
      const liveNode = client.manager.nodeManager.nodes.get(oldNode.id);
      if (liveNode) {
        try {
          await liveNode.destroy();
        } catch (e) {
          client.manager.nodeManager.nodes.delete(oldNode.id);
        }
      }

      // Cập nhật config — giữ nguyên ID cũ, thay thông số mới
      const newNodeConfig = {
        id: oldNode.id,
        // giữ nguyên ID
        host,
        port,
        authorization: password,
        retryAmount: 200,
        retryDelay: 40,
        secure,
        requestTimeout: 60000
      };
      configNodes[nodeIndex] = newNodeConfig;
      writeNodesToConfig(configNodes);
      client.config.nodes = configNodes;
      client.manager.options.nodes = configNodes;

      // Tạo + kết nối node mới
      client.manager.nodeManager.createNode(newNodeConfig);
      await client.manager.nodeManager.connectAll();

      // Reset cờ thông báo
      if (client.lavalinkNotified) client.lavalinkNotified.delete(oldNode.id);
      const embed = new EmbedBuilder().setColor("#00FF00").setDescription(t("lavalink.auto_121") + `**ID:** \`${oldNode.id}\`\n` + t("lavalink.auto_122", {
        var1: oldNode.host,
        var2: oldNode.port
      }) + t("lavalink.auto_123", {
        var1: host,
        var2: port,
        var3: secure ? "SSL" : "Non-SSL"
      }) + `**Latency:** ${result.latency}ms\n` + (playersOnNode.length > 0 ? t("lavalink.auto_124", {
        var1: playersOnNode.length
      }) : "")).setTimestamp();
      await interaction.editReply({
        embeds: [embed]
      });

      // Thông báo kênh setlog
      if (client.sendLavalinkNotification) {
        client.sendLavalinkNotification(new EmbedBuilder().setColor("#00AAFF").setDescription(t("lavalink.auto_125") + `**ID:** \`${oldNode.id}\`\n` + t("lavalink.auto_126", {
          var1: oldNode.host,
          var2: oldNode.port
        }) + t("lavalink.auto_127", {
          var1: host,
          var2: port
        })).setTimestamp());
      }
    } catch (err) {
      return interaction.editReply({
        embeds: [new EmbedBuilder().setColor("#FF0000").setDescription(t("lavalink.errorGeneric", {
          error: err.message
        }))]
      });
    }
  }

  // ================================================================
  // ACTION: RELOAD
  // ================================================================
  if (action === "reload") {
    try {
      const configPath = path.resolve(__dirname, "..", "..", "config.js");
      const devConfigPath = path.resolve(__dirname, "..", "..", "config.dev.js");
      let newConfig;
      if (fs.existsSync(devConfigPath)) {
        delete require.cache[require.resolve(devConfigPath)];
        newConfig = require(devConfigPath);
      } else {
        delete require.cache[require.resolve(configPath)];
        newConfig = require(configPath);
      }
      const oldNodes = client.config.nodes || [];
      const newNodes = newConfig.nodes || [];
      const lavalinkChanged = JSON.stringify(oldNodes) !== JSON.stringify(newNodes);
      client.config = newConfig;
      let changeMsg = "";
      if (lavalinkChanged) {
        const oldIds = oldNodes.map(n => n.id);
        const newIds = newNodes.map(n => n.id);
        const added = newNodes.filter(n => !oldIds.includes(n.id));
        const removed = oldNodes.filter(n => !newIds.includes(n.id));
        const kept = newNodes.filter(n => oldIds.includes(n.id));
        changeMsg = t("lavalink.auto_128");
        if (added.length) changeMsg += t("lavalink.auto_129", {
          var1: added.length
        });
        if (removed.length) changeMsg += t("lavalink.auto_130", {
          var1: removed.length
        });
        if (kept.length) changeMsg += t("lavalink.auto_131", {
          var1: kept.length
        });
      } else {
        changeMsg = t("lavalink.auto_132", {
          var1: newNodes.length
        });
      }
      await interaction.editReply({
        embeds: [new EmbedBuilder().setColor("#FFAA00").setDescription(t("lavalink.reloadingConfig", {
          changes: changeMsg
        }))]
      });
      const activePlayers = [...client.manager.players.values()];
      try {
        await client.manager.nodeManager.disconnectAll(true, false);
      } catch (e) {
        client.manager.nodeManager.nodes.clear();
      }
      client.manager.options.nodes = newConfig.nodes;
      if (client.lavalinkNotified) client.lavalinkNotified.clear();
      for (const nodeOpts of newConfig.nodes) {
        client.manager.nodeManager.createNode(nodeOpts);
      }
      const connected = await client.manager.nodeManager.connectAll();
      if (activePlayers.length > 0) {
        for (const player of activePlayers) {
          try {
            const nowPlayingMsg = player.get("nowPlayingMessage");
            if (nowPlayingMsg) await nowPlayingMsg.delete().catch(() => {});
            const textChannel = client.channels.cache.get(player.textChannelId);
            if (textChannel) {
              await textChannel.send({
                embeds: [new EmbedBuilder().setColor("#FF8800").setDescription(t("error.lavalinkUpdated")).setTimestamp()]
              }).catch(() => {});
            }
            await player.destroy().catch(() => {});
          } catch (e) {}
        }
      }
      const succEmbed = new EmbedBuilder().setColor("#00FF00").setDescription(t("lavalink.auto_133", {
        var1: connected,
        var2: activePlayers.length > 0 ? `**Dọn dẹp:** \`${activePlayers.length}\` player bị gián đoạn.` : ""
      })).setTimestamp();
      await interaction.editReply({
        embeds: [succEmbed]
      });
      if (lavalinkChanged && client.sendLavalinkNotification) {
        const oldIds = oldNodes.map(n => n.id);
        const newIds = newNodes.map(n => n.id);
        const added = newNodes.filter(n => !oldIds.includes(n.id));
        const removed = oldNodes.filter(n => !newIds.includes(n.id));
        const kept = newNodes.filter(n => oldIds.includes(n.id));
        let notifyMsg = t("lavalink.auto_134");
        if (added.length) notifyMsg += added.map(n => `➕ \`${n.id}\`|\`${n.host}:${n.port}\``).join("\n") + "\n";
        if (removed.length) notifyMsg += removed.map(n => `➖ \`${n.id}\`|\`${n.host}:${n.port}\``).join("\n") + "\n";
        if (kept.length) notifyMsg += kept.map(n => `▪️ \`${n.id}\`|\`${n.host}:${n.port}\``).join("\n") + "\n";
        notifyMsg += t("lavalink.auto_135", {
          var1: connected
        });
        client.sendLavalinkNotification(new EmbedBuilder().setColor("#00AAFF").setDescription(notifyMsg).setTimestamp());
      }
    } catch (err) {
      return interaction.editReply({
        embeds: [new EmbedBuilder().setColor("#FF0000").setDescription(t("lavalink.auto_136", {
          var1: err.message
        }))]
      });
    }
  }
});
module.exports = command;