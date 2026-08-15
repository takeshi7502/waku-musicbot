#!/usr/bin/env bash
set -e

DOMAIN="musicbot-api.takeshi.dev"
TARGET="127.0.0.1:3000"

apt update
apt install -y nginx certbot python3-certbot-nginx

cat > /etc/nginx/sites-available/$DOMAIN <<EOF
server {
    listen 80;
    server_name $DOMAIN;

    location / {
        proxy_pass http://$TARGET;
        proxy_http_version 1.1;

        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
}
EOF

ln -sf /etc/nginx/sites-available/$DOMAIN /etc/nginx/sites-enabled/$DOMAIN

nginx -t
systemctl enable --now nginx
systemctl reload nginx

certbot --nginx -d $DOMAIN --non-interactive --agree-tos -m admin@takeshi.dev --redirect

systemctl reload nginx

echo "Done. Test:"
echo "curl https://$DOMAIN/api/public-status"
