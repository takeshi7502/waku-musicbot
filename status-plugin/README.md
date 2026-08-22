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

Copy `build/libs/takeshi-status-plugin-1.1.0.jar` to the running Lavalink
instance's `plugins/` directory, then restart `lavalink`.

Lavalink automatically loads JAR files placed in `plugins/`; no change to
`application.yml` is required for the default setup.

## Compatibility

The plugin is for **Lavalink v4**. Its default build target is the v4.0.0 API,
so it is not tied to a single 4.2.2 node. It does not support Lavalink v3,
whose plugin API is different.

Before upgrading to a newer Lavalink v4 release, the same source can be built
against that exact version without changing the project:

```bash
./gradlew clean build -PlavalinkApiVersion=4.X.Y -PlavalinkServerVersion=4.X.Y
```

Only rebuild and replace the JAR when the plugin source changes, or when you
want to validate it against a different Lavalink v4 release. Dashboard-only
changes do not require rebuilding this plugin.

## Endpoint

`GET /status/activity`

`GET /status/activity/stream`

The dashboard keeps one authenticated Server-Sent Events connection to the
second endpoint and fans changes out to all public visitors. This lets a newly
started, replaced or finished track appear immediately without increasing
Lavalink REST traffic per visitor. The JSON endpoint remains as a compatible
fallback if the stream is temporarily unavailable.

Do not publish either endpoint directly; both follow Lavalink's normal REST
authentication setup.
