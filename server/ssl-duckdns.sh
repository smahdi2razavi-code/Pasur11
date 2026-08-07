#!/bin/bash
# ============================================================================
#  Get free SSL certificate using DNS challenge (DuckDNS)
#  Works even when the server is NOT reachable from outside Iran,
#  because Let's Encrypt only checks a DNS record, not the server itself.
#
#  Usage:
#      bash ssl-duckdns.sh <subdomain> <duckdns-token>
#  Example:
#      bash ssl-duckdns.sh pasur11 a1b2c3d4-e5f6-7890-abcd-ef1234567890
# ============================================================================
set -e

SUB="$1"
TOKEN="$2"
EMAIL="${3:-admin@example.com}"

if [ -z "$SUB" ] || [ -z "$TOKEN" ]; then
  echo "ERROR: missing arguments."
  echo "Usage: bash ssl-duckdns.sh <subdomain> <duckdns-token>"
  exit 1
fi

DOMAIN="${SUB}.duckdns.org"
echo "======================================"
echo " SSL setup for: $DOMAIN"
echo "======================================"

# ---------- 1) install certbot + duckdns plugin ----------
echo "[1/4] Installing certbot and DuckDNS plugin..."
apt-get update -y -qq
apt-get install -y -qq certbot python3-pip nginx
pip3 install --quiet --upgrade certbot-dns-duckdns 2>/dev/null || \
  pip3 install --quiet --break-system-packages --upgrade certbot-dns-duckdns

# ---------- 2) credentials file ----------
echo "[2/4] Writing credentials..."
mkdir -p /etc/letsencrypt
CRED=/etc/letsencrypt/duckdns.ini
echo "dns_duckdns_token = $TOKEN" > "$CRED"
chmod 600 "$CRED"

# ---------- 3) request certificate via DNS challenge ----------
echo "[3/4] Requesting certificate (DNS challenge)..."
certbot certonly \
  --authenticator dns-duckdns \
  --dns-duckdns-credentials "$CRED" \
  --dns-duckdns-propagation-seconds 60 \
  -d "$DOMAIN" \
  --agree-tos -m "$EMAIL" --non-interactive

# ---------- 4) configure nginx with SSL ----------
echo "[4/4] Configuring nginx..."
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
echo " DONE!"
echo ""
echo " Your server address:"
echo "    https://$DOMAIN"
echo ""
echo " Test it:"
echo "    https://$DOMAIN/health"
echo "======================================"
