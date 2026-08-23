---
name: lavalink-android-root
description: Deploy, configure, operate, and troubleshoot a Lavalink v4 node on a rooted Android device using a persistent Linux chroot. Use for Android-root Lavalink work; do not use for ordinary VPS-only deployments.
---

# Lavalink on rooted Android

Use this skill to build a small, durable Lavalink node on an Android phone or
tablet that has root access. It is intentionally device-agnostic: do not assume
a particular manufacturer, Android skin, codename, filesystem path, network, or
Cloudflare account.

The normal target is:

```text
Discord bot or client
        |
        +-- HTTPS / WebSocket (optional public tunnel)
        |
Android root launcher -> Linux chroot -> Lavalink on 127.0.0.1:3333
                                      |-- youtube-source plugin + OAuth
                                      `-- LavaSrc plugin (optional Spotify resolution)
```

The node should bind Lavalink only to loopback. If it needs a public hostname,
publish it through a tunnel or a deliberate reverse proxy; do not expose port
3333 directly from a home router by default.

## Operating principles

- First inspect the existing layout, launch method, running processes, logs,
  Java version, `application.yml`, and plugin JARs. Preserve a working setup.
- Make one change at a time. Back up every config or startup script before
  replacing it. Never log, commit, paste, or display passwords, OAuth refresh
  tokens, Spotify secrets, or Cloudflare credentials.
- Treat a Lavalink restart as an interruption: connected players will be
  dropped and activity history held only in memory will reset.
- Keep the plugin set minimal. For the standard music setup, use only:
  1. the Lavalink YouTube Source plugin; and
  2. LavaSrc when Spotify URL/metadata resolution is desired.
  Add another plugin only for a defined feature and after checking its Lavalink
  v4 compatibility.
- Do not assume a plugin configuration schema. The exact YAML keys and client
  support are determined by the version of the JAR that is installed. Read the
  documentation shipped with or linked by that same release before editing
  `application.yml`.

## 1. Discover the Android environment

Rooted Android can run a real Linux userspace through a `chroot`, a Magisk
module, or another root launcher. Prefer a genuine 64-bit Linux chroot over a
non-root terminal/proot setup for a long-running node.

Before installing anything, record:

```sh
uname -m                    # normally aarch64/arm64 for modern phones
getprop ro.product.device   # Android device codename; not a deployment path
getprop sys.boot_completed
id
```

Choose a persistent rootfs path outside app-private storage, for example:

```text
/data/local/<linux-rootfs>/
```

The launcher must mount the chroot prerequisites before starting services:

```sh
mount -t proc proc "$ROOTFS/proc"
mount --bind /dev "$ROOTFS/dev"
mount --bind /dev/pts "$ROOTFS/dev/pts"
mount --bind /sys "$ROOTFS/sys"
```

Mount only what is needed, check whether each mount already exists, and use
absolute paths in all boot scripts. Android's init environment has a limited
`PATH` and can run before Wi-Fi is ready.

Inside the Linux chroot, install a supported ARM64 Java runtime. Java 21 is a
good default for current Lavalink v4 releases; verify the exact Lavalink release
requirements before downgrading Java.

```sh
apt update
apt install -y openjdk-21-jre-headless ca-certificates curl
java -version
```

If the chroot distribution does not use `apt`, install its equivalent Java 21
runtime and certificate bundle. Do not use an Android Java binary unless it is
known to work with the selected Lavalink release and native libraries.

## 2. Create a predictable node layout

Use one directory owned by the service user. This guide uses `/opt/lavalink` as
an example; any stable path is acceptable.

```text
/opt/lavalink/
├── Lavalink.jar
├── application.yml
├── plugins/
│   ├── youtube-plugin-<version>.jar
│   └── lavasrc-plugin-<version>.jar       # only when required
├── logs/
├── run-lavalink.sh
├── start-lavalink.sh
└── lavalink.pid
```

Download the Lavalink JAR for Linux ARM64-compatible Java and download plugin
JARs from their official release sources. Do not leave duplicate versions of
the same plugin in `plugins/`; plugin discovery may load the wrong one or fail.

Keep `application.yml`, plugin JAR versions, and the Lavalink JAR in a small
deployment manifest or private notes so later upgrades are reproducible.

## 3. Base Lavalink configuration

Start from the `application.yml` provided by the selected Lavalink release and
make the smallest necessary changes. The important invariant is local-only
binding plus a strong password:

```yaml
server:
  address: 127.0.0.1
  port: 3333

lavalink:
  server:
    password: "REPLACE_WITH_A_LONG_RANDOM_SECRET"
```

Use a different secret for every node. A bot connecting through a public tunnel
still needs this password for both REST and WebSocket authentication.

Avoid copying unreviewed JVM flags, IPv6 routing workarounds, proxy settings,
or many source clients into a new node. Add settings only to solve an observed
problem and record why they exist.

## 4. Install the two standard plugins

### YouTube Source

Place one compatible YouTube Source plugin JAR in `plugins/`. Configure it in
the plugin section of the release's documentation. It supplies YouTube search,
URL loading, and the OAuth integration discussed below.

Do not confuse the plugin's remote cipher option with OAuth:

- **OAuth** authorises a YouTube client and is the normal answer to YouTube
  login/bot verification problems when supported by the plugin.
- **remoteCipher** is optional infrastructure used by some YouTube Source
  configurations for cipher/signature handling. It is not a replacement for
  OAuth and should not be added unless the installed plugin documentation calls
  for it. Use only an endpoint you operate or trust.

### LavaSrc

Place one compatible LavaSrc JAR in `plugins/` only if Spotify, Apple Music,
  Deezer, or other metadata URLs are needed. Configure its providers according
to the version's documentation.

Important: Spotify does not provide a stream for Lavalink to play. LavaSrc
normally reads Spotify metadata and resolves a playable source such as YouTube
or SoundCloud. A Spotify link falling back to YouTube is expected behaviour;
the reported playing source should be the resolved source, not Spotify.

Spotify client credentials are optional and belong only in private runtime
configuration. Do not put them in public examples, Git, screenshots, or bot
messages.

## 5. Configure YouTube OAuth safely

OAuth is interactive and must be completed by the account owner in a normal
desktop/mobile browser. The exact authorization flow changes with the YouTube
Source plugin version; follow the release's OAuth instructions rather than
inventing endpoints or YAML keys.

The safe sequence is:

1. Create or select an OAuth client as required by the plugin documentation.
2. Start Lavalink with OAuth initialization enabled.
3. Read the local Lavalink log for the authorization URL and verification code
   or callback instructions.
4. Let the account owner sign in and grant the requested permission. Do not ask
   them to send their account password to an agent.
5. Put the resulting refresh token, client ID, and client secret in the private
   `application.yml` fields required by that exact plugin version.
6. Restrict the config file permissions, restart Lavalink, and confirm a log
   line shows a successful token refresh.

OAuth refresh tokens are long-lived credentials. Rotate or revoke them after a
leak, a project reset, repeated authorization failures, or a change of owner.

## 6. Start scripts and persistent Android boot

Use a two-level launcher:

1. an Android-root boot script that mounts the rootfs and enters the chroot;
2. a chroot script that starts Lavalink and, optionally, the public tunnel.

The chroot Lavalink launcher should use a PID file and a dedicated log:

```sh
#!/bin/sh
set -eu

ROOT=/opt/lavalink
PID_FILE="$ROOT/lavalink.pid"
LOG_FILE="$ROOT/logs/lavalink.log"

mkdir -p "$ROOT/logs"

if [ -s "$PID_FILE" ]; then
  PID="$(cat "$PID_FILE")"
  if [ -r "/proc/$PID/cmdline" ] && grep -aq 'Lavalink.jar' "/proc/$PID/cmdline"; then
    exit 0
  fi
fi

rm -f "$PID_FILE"
nohup java -jar "$ROOT/Lavalink.jar" >> "$LOG_FILE" 2>&1 &
echo $! > "$PID_FILE"
```

Use exact PID validation as above. Never use a broad command such as
`pkill java`, because it can kill unrelated Android or chroot software.

For Magisk, a root-owned executable under `/data/adb/service.d/` is a common
boot hook. It should:

- wait briefly for `sys.boot_completed=1`;
- prepare the chroot mounts idempotently;
- start Lavalink first;
- wait until `127.0.0.1:3333` answers locally before starting a tunnel;
- redirect its own stdout/stderr to a separate Android-visible log.

Do not depend on an open Termux session, screen state, USB debugging, or a PC
being connected. After configuring the boot hook, test one controlled reboot
and verify both the Java process and local health endpoint return.

## 7. Publish the node only when needed

A public node is optional. When the bot runs on a different network, a tunnel
can publish the local HTTP/WebSocket endpoint without opening inbound router
ports. Cloudflare Tunnel is one option; use the platform's documented hostname
and credential setup.

Start the tunnel only after Lavalink is healthy. Keep its process and log
separate from Lavalink.

On mobile networks with QUIC or IPv6 route flapping, Cloudflare Tunnel may log
errors such as `network is unreachable`, `failed to accept QUIC stream`, or
repeated connection registration. In that specific situation, test a more
conservative transport:

```sh
cloudflared --config /root/.cloudflared/config.yml \
  tunnel --protocol http2 --edge-ip-version 4 run <TUNNEL_NAME>
```

This uses TCP/HTTP2 and Cloudflare edge IPv4 instead of QUIC over IPv6. It is a
targeted reliability workaround, not a mandatory setting for every network.
If forcing HTTP/2 fails, inspect whether outbound TCP port 7844 is permitted and
revert to the previously working automatic transport.

## 8. Verification checklist

After each install, upgrade, or restart, verify in this order:

```sh
# On the Android host: process is present.
ps -A | grep '[j]ava.*Lavalink.jar'

# Inside the chroot: Lavalink is listening only locally.
ss -lnt | grep ':3333'

# Local authenticated REST check. Do not paste the password into logs or chat.
curl -fsS -H "Authorization: $LAVALINK_PASSWORD" http://127.0.0.1:3333/v4/info

# Read startup failures, plugin discovery, OAuth state, and track-load errors.
tail -n 150 /opt/lavalink/logs/lavalink.log
```

Expected startup evidence includes:

- Lavalink reports it is ready to accept connections.
- Exactly one YouTube plugin and, if used, exactly one LavaSrc plugin are found
  and loaded.
- OAuth reports a token refresh or the plugin's equivalent success event.
- The bot creates a successful Lavalink WebSocket connection.

For a tunnel, test the public hostname without revealing the password. An HTTP
401 from `/v4/info` is useful: it proves the route is alive while correctly
rejecting an unauthenticated request.

## 9. Troubleshooting decision tree

### The dashboard shows CPU/players but no recent tracks

Standard node statistics come from `/v4/stats`. A separate activity/status
plugin is required to publish a track feed. Check that its JAR is in
`plugins/`, that startup logs say it loaded, and that the dashboard can reach
its authenticated activity endpoint. Activity history normally starts empty
after Lavalink restarts, so play or skip to a new track to test it.

### The bot repeatedly says the node disconnected, but Java remains running

First test local Lavalink health on the Android device. If it is healthy, read
the tunnel log. Network errors in the tunnel are a path problem between bot and
phone, not an audio-source problem. Fix transport/connectivity before changing
Lavalink plugin settings.

### YouTube search or URLs fail

Check the YouTube plugin startup lines, OAuth refresh result, and exact
track-load error. Confirm the installed plugin version supports the configured
clients. Do not repeatedly regenerate tokens or add random clients before
identifying the error.

### Spotify URL does not play

Confirm LavaSrc loaded and its Spotify credentials/provider configuration are
valid. Then confirm a playable fallback provider is enabled. Spotify metadata
must resolve to an actual audio source; it is not direct audio playback.

### The node works until reboot

The boot script is incomplete or runs too early. Read its Android-level log,
verify rootfs mounts and chroot paths, wait for boot/network readiness, and
confirm it starts both Lavalink and any optional tunnel without Termux.

## 10. Upgrade and handoff

For upgrades, stop only the relevant process, back up `application.yml` and the
current JAR list, then change Lavalink or one plugin at a time. Restart, inspect
logs, and play a new test track before proceeding to the next upgrade.

When handing the node to another operator or AI, provide only non-secret facts:

- Android architecture and root/chroot method;
- stable rootfs and Lavalink paths;
- Java, Lavalink, and plugin versions;
- whether the node is loopback-only or tunnel-published;
- log paths, service script paths, and the last verified health result.

Keep all passwords, OAuth refresh tokens, Spotify credentials, and tunnel
credential JSON outside source control and outside the handoff text.
