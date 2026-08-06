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
echo "======================================"
echo " Send a photo of this screen"
echo "======================================"
