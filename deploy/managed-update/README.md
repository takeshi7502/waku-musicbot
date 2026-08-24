# Managed Docker updates from `/reload`

`/reload` has two modes:

- **Soft reload** reloads locale files, in-memory command modules, config and
  Discord presence without restarting the process. It works with `npm start`
  and Docker. It deliberately does not apply changes to event listeners,
  dependencies or Discord's registered Slash Command list.
- **Update & restart** is for a Docker VPS. The bot saves currently playing
  tracks to its database and writes a small request file. A root-owned,
  fixed-purpose systemd helper on the host then pulls `v5`, builds the image,
  runs `npm run deploy`, and recreates the bot container. The new bot restores
  each saved track from its beginning and posts the outcome in the command
  channel.

The bot does **not** receive `/var/run/docker.sock`, shell access, or a way to
choose commands. The only request it can make is a validated `action: update`.

## One-time VPS installation

From the bot checkout on the VPS, after pulling the commit that contains these
files, run (replace the path and branch if yours differ):

```bash
cd /home/takeshidev/music
sudo bash deploy/managed-update/install.sh /home/takeshidev/music v5
```

The installer creates `data/managed-update.enabled`, installs a root-owned
helper at `/usr/local/sbin/waku-musicbot-update`, and enables a systemd path
watcher. It uses the owner of the Git checkout to run Docker Compose, so that
user must already be allowed to run `docker compose`.

Check it with:

```bash
systemctl status waku-musicbot-update.path --no-pager
journalctl -u waku-musicbot-update.service -f
```

## Docker layouts

`docker-compose.yml` is now production-oriented: only `config.js` and `data`
are mounted. Code is baked into the image, preventing `git pull` from changing
a running bot before its image is rebuilt.

For source-mounted Docker development use the override explicitly:

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build
```

For ordinary local development, `npm start` keeps working. Hard update stays
disabled unless the VPS helper marker exists; use Git and your normal local
restart workflow instead.

## Heroku automatic update

On Heroku, `/reload` can create a new release automatically when these Config
Vars are set:

```text
HEROKU_APP_NAME=your-heroku-app-name
HEROKU_API_KEY=your-heroku-account-api-key
```

It downloads the latest commit from the configured public GitHub repository
and branch (`HEROKU_REPOSITORY` and `HEROKU_DEPLOY_BRANCH`, defaulting to
`takeshi7502/waku-musicbot` and `v5`). Heroku builds that source, runs the
`release: npm run deploy` process from `Procfile`, then starts a new worker.
The bot keeps the playback journal in MongoDB, so only the new worker restores
the saved current tracks. The API key can create releases for the app: keep it
only in Heroku Config Vars and never commit or share it.

## Safety and recovery scope

- The helper refuses an update if tracked files have local modifications; it
  never uses `git reset --hard`.
- A hard update always rebuilds and recreates the bot after confirmation, even
  if the remote commit is already current. This lets the saved playback journal
  complete predictably.
- Only an active, unpaused current track is restored. Queue, playback position,
  paused players and controller message state are intentionally not restored,
  matching `/lavalink reload`.
