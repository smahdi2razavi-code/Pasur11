#!/bin/bash
# ============================================================================
#  Fix "bad key share" TLS errors (TLS 1.3 interference on Iranian networks)
#  Forces TLS 1.2 only, which middleboxes usually pass through untouched.
#  Usage:  bash fix-tls.sh
# ============================================================================
set -e
DOMAIN="pasur11.duckdns.org"
CONF=/etc/nginx/sites-available/pasur11

echo "[1/3] Rewriting nginx config (TLS 1.2 only)..."
cat >"$CONF" <<NGINX
server {
    listen 80;
    server_name $DOMAIN;
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
    }
}
server {
    listen 443 ssl;
    server_name $DOMAIN;

    ssl_certificate     /etc/letsencrypt/live/$DOMAIN/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/$DOMAIN/privkey.pem;

    # TLS 1.3 disabled on purpose: its key_share handshake is broken by
    # filtering middleboxes ("bad key share"). TLS 1.2 passes through.
    ssl_protocols TLSv1.2;
    ssl_ciphers ECDHE-RSA-AES128-GCM-SHA256:ECDHE-RSA-AES256-GCM-SHA384:AES128-GCM-SHA256:AES256-GCM-SHA384:HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers off;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 1h;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
}
NGINX

ln -sf "$CONF" /etc/nginx/sites-enabled/pasur11
rm -f /etc/nginx/sites-enabled/default

echo "[2/3] Testing and reloading nginx..."
nginx -t
systemctl reload nginx

echo "[3/3] Local check..."
sleep 1
if curl -sk --max-time 5 https://127.0.0.1/health | grep -q '"ok"'; then
  echo ""
  echo "======================================"
  echo " DONE - TLS 1.2 only is now active"
  echo " Test on your phone:"
  echo "    https://$DOMAIN/health"
  echo "======================================"
else
  echo "WARNING: local https test failed"
  tail -5 /var/log/nginx/error.log
fi
