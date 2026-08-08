#!/bin/bash
# ============================================================================
#  Update Pasur11 server to the latest version and restart it
#  Usage:  bash update.sh
# ============================================================================
set -e
APP_DIR="/opt/pasur11"
RAW="https://raw.githubusercontent.com/smahdi2razavi-code/Pasur11/claude/gallant-planck-ofe9g8/server/server.js"

echo "[1/4] Downloading latest server..."
TMP="/tmp/pasur11-new-server.js"
curl -fsSL "$RAW" -o "$TMP"
if [ ! -s "$TMP" ]; then
  echo "ERROR: download failed"; exit 1
fi
node --check "$TMP" || { echo "ERROR: downloaded file is invalid"; exit 1; }
mkdir -p "$APP_DIR"
cp "$TMP" "$APP_DIR/server.js"
rm -f "$TMP"

echo "[2/4] Restarting app..."
cd "$APP_DIR"
pm2 restart pasur11 --update-env >/dev/null 2>&1 || {
  ADMIN_KEY="$(cat $APP_DIR/admin_key.txt 2>/dev/null)" DATA_FILE="$APP_DIR/data.json" PORT=3000 \
    pm2 start server.js --name pasur11 >/dev/null
}
pm2 save >/dev/null 2>&1 || true

echo "[3/4] Making sure it survives reboot..."
pm2 startup systemd -u root --hp /root >/dev/null 2>&1 || true
systemctl enable nginx >/dev/null 2>&1 || true

echo "[4/4] Testing..."
sleep 2
if curl -s --max-time 5 http://127.0.0.1:3000/health | grep -q '"ok"'; then
  echo ""
  echo "======================================"
  echo " SUCCESS - server is running"
  echo " https://pasur11.duckdns.org/health"
  echo "======================================"
else
  echo "FAIL - app not responding. Last logs:"
  pm2 logs pasur11 --lines 20 --nostream 2>/dev/null | tail -25
fi
