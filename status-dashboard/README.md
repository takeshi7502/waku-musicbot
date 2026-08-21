# Takeshi Lavalink Status Dashboard

Standalone, read-only status page for a Lavalink node. It talks to the local
Lavalink REST API and the bundled status plugin only; it never connects to the
Discord bot.

## What it shows

- Direct Lavalink statistics: online state, player counts, uptime, CPU and RAM.
- A live/recent feed of up to 50 tracks, provided by `../status-plugin`.
- Static operator notices configured in `config.json`, optionally with a safe
  `buttonLabel` and `buttonUrl` link.
- Availability over the last 24 hours, sampled directly from Lavalink once per
  minute and saved locally by the sidecar.
- Total network traffic since the Linux host booted, when `/proc/net/dev` is
  available.

The page never receives Lavalink's password. The Node sidecar uses it locally,
and only returns a deliberately small public response to the browser.

## Install on the Lavalink VPS

The expected VPS layout is:

```text
/home/takeshidev/lavalink/
├── Lavalink.jar
├── application.yml
├── plugins/
├── status-plugin/
└── status-dashboard/
```

1. Copy this `lavalink/` folder to the VPS (or pull the repository there).
   Node.js 18+ is required for the dashboard; on Debian/Ubuntu install it with
   `sudo apt update && sudo apt install -y nodejs` if it is not already present.
2. Build and install the activity plugin:

   ```bash
   cd ~/lavalink/status-plugin
   chmod +x gradlew
   ./gradlew clean build
   cp build/libs/takeshi-status-plugin-1.0.0.jar ~/lavalink/plugins/
   sudo systemctl restart lavalink
   ```

3. Create the private dashboard configuration. Do **not** commit it:

   ```bash
   cd ~/lavalink/status-dashboard
   cp config.example.json config.json
   nano config.json
   chmod 600 config.json
   ```

   Set `lavalink.password` to the same password in `application.yml`. Keep
   `listen.host` as `127.0.0.1`; the status server must not be exposed directly.
   A news item can optionally include `buttonLabel` and an `http`/`https`
   `buttonUrl`; the link is rendered as a compact button inside that notice.

4. Test it locally:

   ```bash
   node server.js
   curl http://127.0.0.1:3010/healthz
   curl http://127.0.0.1:3010/api/status
   ```

5. Install the service. Replace both `<YOUR_LINUX_USER>` placeholders first:

   ```bash
   sudo cp systemd/takeshi-lavalink-status.service /etc/systemd/system/
   sudo nano /etc/systemd/system/takeshi-lavalink-status.service
   sudo systemctl daemon-reload
   sudo systemctl enable --now takeshi-lavalink-status
   sudo systemctl status takeshi-lavalink-status --no-pager
   ```

## Publish safely with Cloudflare Tunnel (optional)

The dashboard stays on loopback. A Cloudflare Tunnel can publish only
`http://127.0.0.1:3010`, so no inbound port 80/443 needs to be opened on the
Lavalink VPS. Copy `cloudflared/config.example.yml`, replace its placeholders,
then run the tunnel as its own service.

Never expose port `3333`, `/v4/*`, or `/status/activity` directly to the
internet. The dashboard is the sole public surface.

## Operational notes

- Activity history is intentionally in memory and clears after Lavalink restarts.
- 24-hour availability begins collecting after the dashboard service first runs;
  it is not guessed from the current process uptime.
- The feed has no requester/guild data and no fake cache-hit labels.
- If stats work but the activity panel says the plugin is unavailable, check:

  ```bash
  sudo journalctl -u lavalink -n 150 --no-pager
  curl -H 'Authorization: YOUR_LAVALINK_PASSWORD' http://127.0.0.1:3333/status/activity
  ```
