# Deploy bot lên Heroku

Heroku chỉ chạy bot. Lavalink tiếp tục chạy trên VPS; MongoDB Atlas lưu toàn bộ
dữ liệu bền vững. Không chạy thêm một bot khác với cùng Discord token.

## 1. Chuẩn bị Lavalink trên VPS

Tạo DNS `node.lavalink.takeshi.dev` trỏ về IP VPS Lavalink. Không dùng hostname
của dashboard vì hai dịch vụ có endpoint `/` khác nhau.

Tạo Nginx site `/etc/nginx/sites-available/node.lavalink.takeshi.dev`:

```nginx
server {
    listen 80;
    listen [::]:80;
    server_name node.lavalink.takeshi.dev;

    location / {
        proxy_pass http://127.0.0.1:3333;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 3600s;
        proxy_send_timeout 3600s;
    }
}
```

Enable site, obtain TLS, then verify the upstream without exposing port 3333:

```bash
sudo ln -s /etc/nginx/sites-available/node.lavalink.takeshi.dev /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d node.lavalink.takeshi.dev --redirect
```

After every client has migrated to the TLS hostname, bind Lavalink to
`127.0.0.1:3333` and remove the cloud firewall rule for TCP 3333. Until then,
keep its existing restricted source-IP rule rather than opening TCP 3333
publicly. The Lavalink password remains a required secret even behind TLS.

## 2. Heroku Config Vars

Set these in **Settings → Config Vars** (or use the values requested by
`app.json`):

| Name | Value |
| --- | --- |
| `DISCORD_TOKEN` | Discord bot token |
| `DISCORD_CLIENT_ID` | Discord application ID |
| `BOT_ADMIN_ID` | Discord user ID of the bot owner |
| `MONGODB_URI` | MongoDB Atlas URI |
| `LAVALINK_HOST` | `node.lavalink.takeshi.dev` |
| `LAVALINK_PASSWORD` | Lavalink password |
| `LAVALINK_PORT` | `443` |
| `LAVALINK_SECURE` | `true` |
| `BOT_LANGUAGE` | `vi` (optional) |

Do not create or upload `config.js` on Heroku. `config.heroku.js` builds the
runtime configuration only when Heroku supplies `DYNO` or `HEROKU_APP_NAME`.

## 3. Deploy and run

Deploy the `v5` branch using Heroku GitHub integration or the Heroku CLI. The
repository's `Procfile` declares:

```procfile
worker: npm start
```

Scale exactly one worker dyno and no web dyno:

```bash
heroku ps:scale worker=1 web=0 --app YOUR_HEROKU_APP
heroku logs --tail --app YOUR_HEROKU_APP
```

The project pins Node.js 22.x for the Heroku buildpack. Heroku filesystem data
is temporary, which is why `MONGODB_URI` is mandatory.
