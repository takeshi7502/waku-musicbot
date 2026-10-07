# Takeshi Lavalink Status Dashboard

Standalone, read-only status page for one or more Lavalink nodes. It talks to
their Lavalink REST APIs and bundled status plugins only; it never connects to
the Discord bot.

## What it shows

- Direct Lavalink statistics for up to 12 nodes: online state, player counts,
  uptime, CPU and RAM. Node rows are collapsed by default and expand on click.
- A live/recent feed of up to 50 tracks, provided immediately by
  `../status-plugin` over one Server-Sent Events connection per node. The
  dashboard also checks each plugin's activity snapshot every 30 seconds while
  the stream is live, so a silent/stale connection cannot freeze the feed.
- One shared five-second Lavalink refresh for node statistics. Both the node
  snapshot and realtime activity changes are streamed to connected browsers;
  visitors never trigger their own Lavalink polling loop.
- Static operator notices configured in `config.json`, optionally with a safe
  `buttonLabel` and `buttonUrl` link.
- Availability over the last 24 hours, sampled directly from Lavalink once per
  minute and saved locally by the sidecar.
- Total network traffic since the Linux host booted, when `/proc/net/dev` is
  available. This is enabled only for a node marked `local: true`, so a remote
  node never shows the dashboard host's traffic by mistake.

The page never receives Lavalink's password. The Node sidecar uses it locally,
and only returns a deliberately small public response to the browser.

## Deploy on Vercel

The web can run entirely on Vercel while Lavalink continues running on your
own machines. No dashboard VPS, `config.json`, or extra database is required.

1. Import `takeshi7502/waku-musicbot` as a single project (not the bot's
   Next.js `dashboard` or a multi-service project).
2. Set the production branch to `lavalink` under **Settings → Environments →
   Production → Branch Tracking**.
3. Set **Root Directory** to `status-dashboard` and **Framework Preset** to
   **Other**. Keep build/output overrides disabled: `vercel.json` defines the
   Node function, static assets and routes. Do not use `npm start` as a build command.
4. Add the server-side environment variable `LAVALINK_NODES` for Production
   (and Preview if needed). Its value is a JSON array, for example:

   ```json
   [
     {"id":"dell","name":"Dell","url":"https://dell.takeshi.dev:443","password":"YOUR_NODE_PASSWORD"},
     {"id":"node2","name":"Node 2","url":"http://YOUR_VPS_IP:3333","password":"YOUR_OTHER_PASSWORD"}
   ]
   ```

   Each node URL must be reachable **from Vercel**, not `localhost` or a LAN IP.
   Lavalink passwords stay in the function and are never sent to the browser.
   Do not prefix these variables with `NEXT_PUBLIC_`, and never commit credentials.
5. Under **Deployments → Create Deployment**, deploy the `lavalink` branch.
   Redeploy after changing environment variables.

Optional environment variables:

| Variable | Default | Value |
| --- | --- | --- |
| `DASHBOARD_REFRESH_SECONDS` | `5` | Refresh interval, clamped to 3–60 seconds |
| `DASHBOARD_TIME_ZONE` | `Asia/Ho_Chi_Minh` | IANA time zone |
| `DASHBOARD_NEWS` | `[]` | JSON array of notices using the same fields as `config.example.json` |

On Vercel the browser polls `/api/status` at the configured interval. The
function fetches fresh statistics and `/status/activity` snapshots on demand;
there are no persistent upstream streams or background polling timers. Nodes
still need the status plugin to show tracks. The VPS deployment retains SSE
and its existing `config.json` behavior; environment node configuration takes
precedence if provided.

24-hour availability is **unavailable on Vercel**, because a function instance
is not a continuous monitoring process and its local files are not persistent.
The dashboard does not invent uptime history. Node uptime, CPU, RAM, player
counts and activity continue working. `local: true` is ignored on Vercel so
the function host's network counters cannot be mistaken for a node's traffic.

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

### Quick setup script

From the `lavalink` branch, run the dashboard helper directly on the VPS:

```bash
cd ~/lavalink/status-dashboard
chmod +x run.sh
./run.sh
```

On the first run it checks for Node.js 18+, creates a private `config.json`,
then offers an interactive menu:

1. install/update and start the systemd service, then optionally publish it through Nginx with HTTPS;
2. run a foreground test;
3. follow service logs;
4. restart the service;
5. stop the service;
6. remove only the dashboard setup.

When choosing option 1, enter the public domain after its DNS A record points
to the VPS and inbound TCP ports 80/443 are allowed. The helper creates a
domain-specific Nginx reverse proxy to the loopback dashboard port from
`config.json`, then obtains/renews its Let's Encrypt certificate using
Certbot. Leave the domain blank to run only the loopback service.

Removal stops and deletes the systemd service, managed Nginx site,
`config.json`, and local dashboard data. It deliberately leaves Lavalink, its
plugins, Cloudflare Tunnel, Node.js, Nginx, certificates, and dashboard source
code untouched.

The first configuration creates one local primary node. To add remote nodes,
edit `config.json` afterwards and choose **Restart** from the menu.

### Manual setup

1. Copy this `lavalink/` folder to the VPS (or pull the repository there).
   Node.js 18+ is required for the dashboard; on Debian/Ubuntu install it with
   `sudo apt update && sudo apt install -y nodejs` if it is not already present.
2. Build and install the activity plugin:

   ```bash
   cd ~/lavalink/status-plugin
   chmod +x gradlew
   ./gradlew clean build
   cp build/libs/takeshi-status-plugin-1.1.0.jar ~/lavalink/plugins/
   sudo systemctl restart lavalink
   ```

3. Create the private dashboard configuration. Do **not** commit it:

   ```bash
   cd ~/lavalink/status-dashboard
   cp config.example.json config.json
   nano config.json
   chmod 600 config.json
   ```

   Add one object per node to `nodes`. Each object needs a unique `id`, readable
   `name`, `url`, and the matching Lavalink `password`. Set `local: true` only
   when that Lavalink process runs on the same machine as this dashboard.
   Keep `listen.host` as `127.0.0.1`; the status server must not be exposed
   directly. `dashboard.timeZone` controls the displayed "Phát lúc" time in the
   activity feed. A news item can optionally include `buttonLabel` and an
   `http`/`https` `buttonUrl`; the link is rendered as a compact button inside
   that notice.

   Example of adding the phone node after the primary node:

   ```json
   {
     "id": "pnode",
     "name": "PNode",
     "url": "https://pnode.takeshi.dev",
     "password": "THE_PHONE_LAVALINK_PASSWORD",
     "local": false
   }
   ```

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

Never expose port `3333`, `/v4/*`, `/status/activity`, or
`/status/activity/stream` directly to the
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
  curl -N -H 'Authorization: YOUR_LAVALINK_PASSWORD' http://127.0.0.1:3333/status/activity/stream
  ```
