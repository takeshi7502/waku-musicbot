# Takeshi Lavalink Status Plugin

This small Lavalink v4 plugin records a **memory-only** feed of the latest 50
tracks for the standalone status dashboard. It does not contact the Discord bot.

The endpoint only returns safe public track fields: title, author, duration,
source, artwork URL and playback state. It intentionally excludes guild IDs,
Discord voice tokens/endpoints, session IDs, encoded tracks and requester data.

## Build

Windows:

```powershell
cd lavalink/status-plugin
.\gradlew.bat clean build
```

Linux:

```bash
cd ~/lavalink/status-plugin
chmod +x gradlew
./gradlew clean build
```

Copy `build/libs/takeshi-status-plugin-1.0.0.jar` to the running Lavalink
instance's `plugins/` directory, then restart `lavalink`.

Lavalink automatically loads JAR files placed in `plugins/`; no change to
`application.yml` is required for the default setup.

## Endpoint

`GET /status/activity`

It is consumed by the loopback-only status dashboard server. Do not publish this
endpoint directly; it follows Lavalink's normal REST authentication setup.
