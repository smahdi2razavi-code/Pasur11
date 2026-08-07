#!/bin/bash
# ============================================================================
#  Free SSL certificate via DNS challenge (DuckDNS) - no pip needed
#  Works when the server is NOT reachable from outside Iran.
#  Runs detached, so a VNC disconnect will not stop it.
#
#  Usage:
#      bash ssl-duckdns.sh <subdomain> <duckdns-token> [email]
# ============================================================================
set -e

SUB="$1"
TOKEN="$2"
EMAIL="${3:-admin@example.com}"
LOG=/root/ssl-setup.log

if [ -z "$SUB" ] || [ -z "$TOKEN" ]; then
  echo "ERROR: Usage: bash ssl-duckdns.sh <subdomain> <duckdns-token> [email]"
  exit 1
fi

DOMAIN="${SUB}.duckdns.org"

# ---- re-exec detached so VNC disconnect cannot kill it -------------------
if [ "$DETACHED" != "1" ]; then
  echo "======================================"
  echo " Starting SSL setup for: $DOMAIN"
  echo " Running in background (safe from disconnect)."
  echo ""
  echo " Watch progress:   tail -f $LOG"
  echo " Check result:     tail -20 $LOG"
  echo "======================================"
  DETACHED=1 setsid nohup bash "$0" "$SUB" "$TOKEN" "$EMAIL" > "$LOG" 2>&1 < /dev/null &
  sleep 2
  echo "Started. Now run:  tail -f $LOG"
  exit 0
fi

echo "======================================"
echo " SSL setup for: $DOMAIN"
echo "======================================"

# ---------- 1) install certbot from apt (no pip) ----------
echo "[1/5] Installing certbot and nginx..."
apt-get update -y -qq
apt-get install -y -qq certbot nginx curl

# ---------- 2) DuckDNS hook scripts (plain curl, no plugin) ----------
echo "[2/5] Creating DuckDNS hooks..."
cat >/usr/local/bin/duck-auth.sh <<HOOK
#!/bin/bash
curl -s "https://www.duckdns.org/update?domains=${SUB}&token=${TOKEN}&txt=\$CERTBOT_VALIDATION" >/dev/null
sleep 45
HOOK

cat >/usr/local/bin/duck-clean.sh <<HOOK
#!/bin/bash
curl -s "https://www.duckdns.org/update?domains=${SUB}&token=${TOKEN}&txt=removed&clear=true" >/dev/null
HOOK

chmod +x /usr/local/bin/duck-auth.sh /usr/local/bin/duck-clean.sh

# ---------- 3) verify DuckDNS token works ----------
echo "[3/5] Testing DuckDNS token..."
RESP="$(curl -s --max-time 30 "https://www.duckdns.org/update?domains=${SUB}&token=${TOKEN}&txt=test123")"
if [ "$RESP" != "OK" ]; then
  echo "ERROR: DuckDNS rejected the token (response: $RESP)"
  echo "Check the subdomain name and token, then run again."
  exit 1
fi
curl -s "https://www.duckdns.org/update?domains=${SUB}&token=${TOKEN}&txt=removed&clear=true" >/dev/null
echo "   token OK"

# ---------- 4) request certificate ----------
echo "[4/5] Requesting certificate (DNS challenge, takes ~1 min)..."
certbot certonly --manual --preferred-challenges dns \
  --manual-auth-hook /usr/local/bin/duck-auth.sh \
  --manual-cleanup-hook /usr/local/bin/duck-clean.sh \
  -d "$DOMAIN" \
  --agree-tos -m "$EMAIL" --non-interactive

# ---------- 5) configure nginx ----------
echo "[5/5] Configuring nginx..."
cat >/etc/nginx/sites-available/pasur11 <<NGINX
server {
    listen 80;
    server_name $DOMAIN;
    return 301 https://\$host\$request_uri;
}
server {
    listen 443 ssl;
    server_name $DOMAIN;

    ssl_certificate     /etc/letsencrypt/live/$DOMAIN/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/$DOMAIN/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
}
NGINX

ln -sf /etc/nginx/sites-available/pasur11 /etc/nginx/sites-enabled/pasur11
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx

echo ""
echo "======================================"
echo " SUCCESS!"
echo ""
echo " Your server address:"
echo "    https://$DOMAIN"
echo ""
echo " Test:  https://$DOMAIN/health"
echo "======================================"
