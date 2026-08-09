#!/bin/bash
# ============================================================================
#  نصب خودکار سرور پاسور ۱۱ روی سرور مجازی لینوکس (اوبونتو)
#  ----------------------------------------------------------------------------
#  این اسکریپت همه‌چیز را خودش نصب و تنظیم می‌کند:
#    Node.js، pm2، Nginx، گواهی SSL رایگان و فایروال
#
#  روش استفاده (روی سرور، با کاربر root):
#      bash setup.sh api.yourdomain.ir
# ============================================================================
set -e

DOMAIN="$1"
APP_DIR="/opt/pasur11"
RAW_BASE="https://raw.githubusercontent.com/smahdi2razavi-code/Pasur11/claude/gallant-planck-ofe9g8/server"

# اگر دامنه داده نشده، از آی‌پی عمومی سرور یک دامنهٔ رایگان sslip.io ساخته می‌شود
if [ -z "$DOMAIN" ]; then
  echo "▶ دامنه وارد نشده؛ ساخت دامنهٔ رایگان از روی آی‌پی سرور..."
  IP="$(curl -s --max-time 10 https://api.ipify.org || true)"
  [ -z "$IP" ] && IP="$(hostname -I | awk '{print $1}')"
  if [ -z "$IP" ]; then
    echo "❌ آی‌پی سرور پیدا نشد. دامنه را دستی بده:  bash setup.sh 94-184-36-13.sslip.io"
    exit 1
  fi
  DOMAIN="$(echo "$IP" | tr '.' '-').sslip.io"
  echo "   آی‌پی: $IP  →  دامنه: $DOMAIN"
fi

echo "════════════════════════════════════════"
echo "  نصب سرور پاسور ۱۱ روی دامنهٔ: $DOMAIN"
echo "════════════════════════════════════════"

# ---------- ۱) به‌روزرسانی سیستم ----------
echo "▶ گام ۱ از ۷: به‌روزرسانی سیستم..."
apt-get update -y -qq
apt-get upgrade -y -qq

# ---------- ۲) نصب Node.js ----------
echo "▶ گام ۲ از ۷: نصب Node.js..."
if ! command -v node >/dev/null 2>&1; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash - >/dev/null 2>&1
  apt-get install -y -qq nodejs
fi
echo "   نسخهٔ Node: $(node -v)"

# ---------- ۳) قرار دادن فایل سرور ----------
echo "▶ گام ۳ از ۷: آماده‌سازی پوشهٔ برنامه..."
mkdir -p "$APP_DIR"
if [ -f "./server.js" ]; then
  cp ./server.js "$APP_DIR/"
  [ -f ./package.json ] && cp ./package.json "$APP_DIR/"
else
  echo "   دانلود فایل سرور از گیت‌هاب..."
  curl -fsSL "$RAW_BASE/server.js"    -o "$APP_DIR/server.js"
  curl -fsSL "$RAW_BASE/package.json" -o "$APP_DIR/package.json" || true
fi
if [ ! -s "$APP_DIR/server.js" ]; then
  echo "❌ دانلود فایل سرور ناموفق بود. اینترنت سرور را بررسی کن."
  exit 1
fi

# ---------- ۴) ساخت کلید مدیریت ----------
echo "▶ گام ۴ از ۷: ساخت کلید مدیریت..."
KEY_FILE="$APP_DIR/admin_key.txt"
if [ ! -f "$KEY_FILE" ]; then
  ADMIN_KEY="$(head -c 24 /dev/urandom | base64 | tr -dc 'A-Za-z0-9' | head -c 24)"
  echo "$ADMIN_KEY" > "$KEY_FILE"
  chmod 600 "$KEY_FILE"
else
  ADMIN_KEY="$(cat "$KEY_FILE")"
fi

# ---------- ۵) اجرای دائمی با pm2 ----------
echo "▶ گام ۵ از ۷: راه‌اندازی سرویس..."
npm install -g pm2 --silent >/dev/null 2>&1 || true
cd "$APP_DIR"
pm2 delete pasur11 >/dev/null 2>&1 || true
ADMIN_KEY="$ADMIN_KEY" DATA_FILE="$APP_DIR/data.json" PORT=3000 \
  pm2 start server.js --name pasur11 >/dev/null
pm2 save >/dev/null
pm2 startup systemd -u root --hp /root >/dev/null 2>&1 || true

# ---------- ۵ب) پشتیبان خودکار روزانه ----------
echo "▶ نصب پشتیبان خودکار روزانه..."
curl -fsSL "https://raw.githubusercontent.com/smahdi2razavi-code/Pasur11/claude/gallant-planck-ofe9g8/server/backup.sh" \
  -o "$APP_DIR/backup.sh" 2>/dev/null && chmod +x "$APP_DIR/backup.sh"
if [ -s "$APP_DIR/backup.sh" ]; then
  CRON_LINE="20 3 * * * DATA_FILE=$APP_DIR/data.json /bin/bash $APP_DIR/backup.sh >> $APP_DIR/backup.log 2>&1"
  ( crontab -l 2>/dev/null | grep -v 'pasur11/backup.sh' ; echo "$CRON_LINE" ) | crontab -
  echo "   ✔ هر شب ساعت ۳:۲۰ پشتیبان گرفته می‌شود (۱۴ روز نگهداری)"
else
  echo "   ⚠️ دانلود backup.sh ناموفق بود — پشتیبان خودکار نصب نشد"
fi

# ---------- ۶) Nginx و گواهی SSL ----------
echo "▶ گام ۶ از ۷: نصب Nginx و گواهی SSL..."
apt-get install -y -qq nginx certbot python3-certbot-nginx

cat >/etc/nginx/sites-available/pasur11 <<NGINX
server {
    listen 80;
    server_name $DOMAIN;
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
nginx -t >/dev/null 2>&1 && systemctl reload nginx

echo "   دریافت گواهی SSL رایگان..."
certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos \
        --register-unsafely-without-email --redirect >/dev/null 2>&1 \
  && SSL_OK=1 || SSL_OK=0

# ---------- ۷) فایروال ----------
echo "▶ گام ۷ از ۷: تنظیم فایروال..."
apt-get install -y -qq ufw
ufw allow OpenSSH >/dev/null 2>&1
ufw allow 'Nginx Full' >/dev/null 2>&1
ufw --force enable >/dev/null 2>&1

# ---------- نتیجه ----------
echo ""
echo "════════════════════════════════════════"
if [ "$SSL_OK" = "1" ]; then
  echo "  ✅ نصب کامل شد!"
  echo ""
  echo "  آدرس سرور تو:"
  echo "     https://$DOMAIN"
  echo ""
  echo "  تست سلامت:"
  echo "     https://$DOMAIN/health"
else
  echo "  ⚠ سرور نصب شد ولی گواهی SSL گرفته نشد."
  echo "  احتمالاً دامنه هنوز به آی‌پی سرور وصل نشده."
  echo "  بعد از تنظیم دامنه، این را اجرا کن:"
  echo "     certbot --nginx -d $DOMAIN"
fi
echo ""
echo "  🔑 کلید مدیریت (برای ربات تلگرام) — جای امن نگه دار:"
echo "     $ADMIN_KEY"
echo ""
echo "  این کلید در این فایل هم ذخیره شده:"
echo "     $KEY_FILE"
echo "════════════════════════════════════════"
