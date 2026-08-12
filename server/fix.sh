#!/bin/bash
# ============================================================================
#  Pasur11 - ONE COMMAND REPAIR
#  Finds why the server is not answering and fixes it automatically.
#  Run in VNC:
#    bash <(curl -sL https://raw.githubusercontent.com/smahdi2razavi-code/Pasur11/claude/gallant-planck-ofe9g8/server/fix.sh)
# ============================================================================
APP_DIR="/opt/pasur11"
BASE="https://raw.githubusercontent.com/smahdi2razavi-code/Pasur11/claude/gallant-planck-ofe9g8/server"
PORT=3000
PROBLEMS=0

say(){ echo ""; echo "=== $1 ==="; }
ok(){  echo "  OK    - $1"; }
bad(){ echo "  FIX   - $1"; PROBLEMS=$((PROBLEMS+1)); }

echo "========================================"
echo " PASUR11 SERVER REPAIR"
echo " $(date '+%F %T')"
echo "========================================"

# ---------- 1) Node ----------
say "1. Node.js"
if command -v node >/dev/null 2>&1; then ok "node $(node -v)"
else
  bad "node is missing - installing"
  curl -fsSL https://deb.nodesource.com/setup_20.x 2>/dev/null | bash - >/dev/null 2>&1
  apt-get install -y -qq nodejs >/dev/null 2>&1
  command -v node >/dev/null 2>&1 && ok "installed $(node -v)" || echo "  ERROR - could not install node"
fi

# ---------- 2) pm2 ----------
say "2. pm2"
if command -v pm2 >/dev/null 2>&1; then ok "pm2 present"
else
  bad "pm2 missing - installing"
  npm install -g pm2 --silent >/dev/null 2>&1
fi

# ---------- 3) app files ----------
say "3. Application files"
mkdir -p "$APP_DIR"
# Always fetch the newest server.js - an OLD file is the most common cause of
# "feature missing" problems, and a present-but-outdated file must be replaced.
TMP="/tmp/pasur11-server-new.js"
if curl -fsSL --max-time 30 "$BASE/server.js" -o "$TMP" && [ -s "$TMP" ] && node --check "$TMP" 2>/dev/null; then
  if [ -s "$APP_DIR/server.js" ] && cmp -s "$TMP" "$APP_DIR/server.js"; then
    ok "server.js is already the latest version"
  else
    bad "server.js was old or missing - updating to the latest"
    # snapshot the data before swapping the code
    if [ -s "$APP_DIR/data.json" ]; then
      mkdir -p "$APP_DIR/backups"
      gzip -c "$APP_DIR/data.json" > "$APP_DIR/backups/data-before-fix.json.gz" 2>/dev/null
      echo "  data snapshot -> backups/data-before-fix.json.gz"
    fi
    [ -s "$APP_DIR/server.js" ] && cp "$APP_DIR/server.js" "$APP_DIR/server.js.prev"
    cp "$TMP" "$APP_DIR/server.js"
    echo "  updated"
  fi
  rm -f "$TMP"
elif [ -s "$APP_DIR/server.js" ]; then
  ok "could not download (no internet?) - keeping the existing server.js"
else
  bad "server.js missing and download failed - cannot continue"
fi
if [ -s "$APP_DIR/admin_key.txt" ]; then
  ok "admin key found"
else
  bad "admin key missing - creating a new one"
  head -c 18 /dev/urandom | base64 | tr -d '/+=' > "$APP_DIR/admin_key.txt"
  echo "  NEW KEY: $(cat $APP_DIR/admin_key.txt)   <-- write this down!"
fi
KEY="$(cat "$APP_DIR/admin_key.txt" 2>/dev/null)"

# ---------- 4) data file health ----------
say "4. Data file"
if [ ! -f "$APP_DIR/data.json" ]; then
  ok "no data file yet (fresh install) - will be created"
elif node -e "JSON.parse(require('fs').readFileSync('$APP_DIR/data.json','utf8'))" 2>/dev/null; then
  ok "data.json is valid ($(du -h "$APP_DIR/data.json" | cut -f1))"
else
  bad "data.json is CORRUPT - restoring newest backup"
  LATEST="$(ls -1t "$APP_DIR"/backups/*.gz 2>/dev/null | head -1)"
  if [ -n "$LATEST" ]; then
    cp "$APP_DIR/data.json" "$APP_DIR/data.json.broken.$(date +%s)" 2>/dev/null
    gunzip -c "$LATEST" > "$APP_DIR/data.json" && echo "  restored from $(basename "$LATEST")"
  else
    echo "  ERROR - no backup available. Moving the broken file aside."
    mv "$APP_DIR/data.json" "$APP_DIR/data.json.broken.$(date +%s)"
  fi
fi

# ---------- 5) start / restart the app ----------
say "5. Starting the app"
cd "$APP_DIR" || exit 1
pm2 delete pasur11 >/dev/null 2>&1
ADMIN_KEY="$KEY" DATA_FILE="$APP_DIR/data.json" PORT=$PORT \
  pm2 start server.js --name pasur11 >/dev/null 2>&1
pm2 save >/dev/null 2>&1
pm2 startup systemd -u root --hp /root >/dev/null 2>&1
sleep 3
if curl -s --max-time 6 "http://127.0.0.1:$PORT/health" | grep -q '"ok"'; then
  ok "app answers on port $PORT"
else
  bad "app is NOT answering - last 20 log lines:"
  pm2 logs pasur11 --lines 20 --nostream 2>/dev/null | tail -22
fi

# ---------- 6) nginx ----------
say "6. Nginx (port 80)"
if ! command -v nginx >/dev/null 2>&1; then
  bad "nginx missing - installing"
  apt-get install -y -qq nginx >/dev/null 2>&1
fi
if [ ! -s /etc/nginx/sites-available/pasur11 ]; then
  bad "nginx config missing - creating"
  cat >/etc/nginx/sites-available/pasur11 <<NGINX
server {
    listen 80 default_server;
    server_name _;
    location / {
        proxy_pass http://127.0.0.1:$PORT;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
}
NGINX
  ln -sf /etc/nginx/sites-available/pasur11 /etc/nginx/sites-enabled/pasur11
  rm -f /etc/nginx/sites-enabled/default
fi
if nginx -t >/dev/null 2>&1; then
  systemctl enable nginx >/dev/null 2>&1
  systemctl restart nginx >/dev/null 2>&1
  ok "nginx config valid and restarted"
else
  bad "nginx config is broken:"
  nginx -t 2>&1 | tail -5
fi

# ---------- 7) firewall ----------
say "7. Firewall"
if command -v ufw >/dev/null 2>&1 && ufw status 2>/dev/null | grep -q "Status: active"; then
  ufw allow 80/tcp  >/dev/null 2>&1
  ufw allow 443/tcp >/dev/null 2>&1
  ok "ports 80 and 443 allowed"
else
  ok "ufw not active (nothing blocking)"
fi

# ---------- 8) daily backup ----------
say "8. Daily backup"
if [ ! -s "$APP_DIR/backup.sh" ]; then
  curl -fsSL "$BASE/backup.sh" -o "$APP_DIR/backup.sh" 2>/dev/null && chmod +x "$APP_DIR/backup.sh"
fi
if crontab -l 2>/dev/null | grep -q 'pasur11/backup.sh'; then
  ok "cron installed"
else
  bad "cron missing - installing"
  ( crontab -l 2>/dev/null | grep -v 'pasur11/backup.sh' ; \
    echo "20 3 * * * DATA_FILE=$APP_DIR/data.json /bin/bash $APP_DIR/backup.sh >> $APP_DIR/backup.log 2>&1" ) | crontab -
fi

# ---------- 9) final check ----------
say "9. FINAL CHECK"
L=$(curl -s --max-time 6 "http://127.0.0.1:$PORT/health")
P=$(curl -s --max-time 8 "http://127.0.0.1/health")
echo "  direct app  : ${L:-NO REPLY}"
echo "  through 80  : ${P:-NO REPLY}"
echo ""
echo "  Feature check (new features need the latest server.js):"
for ep in tickets/11-000000 stats control audit; do
  R=$(curl -s --max-time 5 "http://127.0.0.1:$PORT/$ep.json?key=$KEY")
  case "$R" in
    *"not found"*) echo "    MISSING  /$ep" ;;
    "")            echo "    NO REPLY /$ep" ;;
    *)             echo "    OK       /$ep" ;;
  esac
done
# newest features report themselves in /health -> feat[]
for f in auth pay; do
  case "$L" in
    *"\"$f\""*) echo "    OK       $f" ;;
    *)          echo "    MISSING  $f   <-- server.js is still old" ;;
  esac
done

echo ""
echo "========================================"
if echo "$P" | grep -q '"ok"'; then
  echo " RESULT: SERVER IS UP"
  # find the public IP without printing junk if the lookup is blocked
  IP="$(ip -4 route get 1.1.1.1 2>/dev/null | grep -oE 'src [0-9.]+' | awk '{print $2}')"
  echo "$IP" | grep -qE '^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$' || IP="94.184.36.13"
  echo " Test in your browser:  http://$IP/health"
else
  echo " RESULT: STILL BROKEN - send a photo of this screen"
fi
echo " Problems found and fixed: $PROBLEMS"
echo " Admin key: $KEY"
echo "========================================"
