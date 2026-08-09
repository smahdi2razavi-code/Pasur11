#!/bin/bash
# ============================================================================
#  Update Pasur11 server to the latest version and restart it
#  Usage:  bash update.sh
# ============================================================================
set -e
APP_DIR="/opt/pasur11"
BASE="https://raw.githubusercontent.com/smahdi2razavi-code/Pasur11/claude/gallant-planck-ofe9g8/server"
RAW="$BASE/server.js"

echo "[1/5] Downloading latest server..."
TMP="/tmp/pasur11-new-server.js"
curl -fsSL "$RAW" -o "$TMP"
if [ ! -s "$TMP" ]; then
  echo "ERROR: download failed"; exit 1
fi
node --check "$TMP" || { echo "ERROR: downloaded file is invalid"; exit 1; }
mkdir -p "$APP_DIR"

# Safety net: snapshot the data file before swapping the server
if [ -s "$APP_DIR/data.json" ]; then
  mkdir -p "$APP_DIR/backups"
  gzip -c "$APP_DIR/data.json" > "$APP_DIR/backups/data-before-update.json.gz" 2>/dev/null || true
  echo "      (data snapshot saved to backups/data-before-update.json.gz)"
fi

cp "$TMP" "$APP_DIR/server.js"
rm -f "$TMP"

echo "[2/5] Installing daily backup..."
curl -fsSL "$BASE/backup.sh" -o "$APP_DIR/backup.sh" && chmod +x "$APP_DIR/backup.sh"
if [ -s "$APP_DIR/backup.sh" ]; then
  # Every night at 03:20 - keeps the last 14 days
  CRON_LINE="20 3 * * * DATA_FILE=$APP_DIR/data.json /bin/bash $APP_DIR/backup.sh >> $APP_DIR/backup.log 2>&1"
  ( crontab -l 2>/dev/null | grep -v 'pasur11/backup.sh' ; echo "$CRON_LINE" ) | crontab -
  echo "      cron installed (daily 03:20, keeps 14 days)"
  DATA_FILE="$APP_DIR/data.json" /bin/bash "$APP_DIR/backup.sh" || true
else
  echo "      WARNING: backup.sh download failed - no automatic backups!"
fi

echo "[3/5] Restarting app..."
cd "$APP_DIR"
pm2 restart pasur11 --update-env >/dev/null 2>&1 || {
  ADMIN_KEY="$(cat $APP_DIR/admin_key.txt 2>/dev/null)" DATA_FILE="$APP_DIR/data.json" PORT=3000 \
    pm2 start server.js --name pasur11 >/dev/null
}
pm2 save >/dev/null 2>&1 || true

echo "[4/5] Making sure it survives reboot..."
pm2 startup systemd -u root --hp /root >/dev/null 2>&1 || true
systemctl enable nginx >/dev/null 2>&1 || true

echo "[5/5] Testing..."
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
