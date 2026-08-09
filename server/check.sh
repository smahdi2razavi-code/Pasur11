#!/bin/bash
# Diagnostic tool for Pasur11 server (English output for VNC readability)
echo "======================================"
echo " PASUR11 SERVER CHECK"
echo "======================================"

echo ""
echo "[1] Node app (pm2):"
pm2 list 2>/dev/null | grep -E "pasur11|status" || echo "  pm2 NOT RUNNING"

echo ""
echo "[2] App on port 3000 (local):"
if curl -s --max-time 5 http://127.0.0.1:3000/health | grep -q '"ok"'; then
  echo "  OK - app responds"
else
  echo "  FAIL - app not responding"
  echo "  --- last 15 log lines ---"
  pm2 logs pasur11 --lines 15 --nostream 2>/dev/null | tail -20
fi

echo ""
echo "[3] Nginx service:"
systemctl is-active nginx 2>/dev/null || echo "  nginx NOT active"

echo ""
echo "[4] Nginx config test:"
nginx -t 2>&1 | tail -2

echo ""
echo "[5] Nginx proxy (local port 80):"
if curl -s --max-time 5 http://127.0.0.1/health | grep -q '"ok"'; then
  echo "  OK - nginx proxies correctly"
else
  echo "  FAIL - nginx does not proxy"
  echo "  enabled sites:"
  ls /etc/nginx/sites-enabled/ 2>/dev/null
fi

echo ""
echo "[6] Ports listening:"
ss -tlnp 2>/dev/null | grep -E ':80|:443|:3000' || echo "  none found"

echo ""
echo "[7] Firewall (ufw):"
ufw status 2>/dev/null | head -6

echo ""
echo "[8] HTTPS local test (port 443):"
if curl -sk --max-time 5 https://127.0.0.1/health | grep -q '"ok"'; then
  echo "  OK - https works locally"
else
  echo "  FAIL - https not working"
fi

echo ""
echo "[9] Certificate files:"
ls /etc/letsencrypt/live/ 2>/dev/null || echo "  no certs found"

echo ""
echo "[10] Nginx 443 config:"
nginx -T 2>/dev/null | grep -c "listen 443" | xargs echo "  'listen 443' lines:"
nginx -T 2>/dev/null | grep "ssl_certificate " | head -2

echo ""
echo "[11] Nginx error log (last 5):"
tail -5 /var/log/nginx/error.log 2>/dev/null || echo "  no log"

echo ""
echo "[12] Server VERSION - which features are installed:"
for ep in "tickets/11-000000" "stats" "control" "audit"; do
  R=$(curl -s --max-time 5 "http://127.0.0.1:3000/$ep.json?key=$(cat /opt/pasur11/admin_key.txt 2>/dev/null)")
  case "$R" in
    *"not found"*) echo "  MISSING  /$ep   <-- server is OLD, run update.sh" ;;
    "")            echo "  NO REPLY /$ep   <-- app may be down" ;;
    *)             echo "  OK       /$ep" ;;
  esac
done

echo ""
echo "[13] Daily backup:"
if crontab -l 2>/dev/null | grep -q 'pasur11/backup.sh'; then
  echo "  cron: INSTALLED"
else
  echo "  cron: MISSING  <-- run update.sh"
fi
ls -1 /opt/pasur11/backups/*.gz 2>/dev/null | tail -3 || echo "  no backups yet"

echo ""
echo "======================================"
echo " Send a photo of this screen"
echo "======================================"
