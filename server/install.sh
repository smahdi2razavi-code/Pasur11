#!/usr/bin/env bash
# ============================================================================
#  نصب خودکار سرور بازی پاسور ۱۱ روی سرور مجازی اوبونتو (پارس‌پک، آروان، …)
#
#  طرز استفاده — این یک خط را در ترمینال سرور بزنید:
#
#     sudo bash install.sh api.example.ir
#
#  به‌جای api.example.ir دامنهٔ خودتان را بنویسید (باید از قبل به آی‌پی این
#  سرور اشاره کند). اگر دامنه ندارید، بدون آن اجرا کنید تا فقط روی آی‌پی
#  و پورت ۸۰۸۰ بالا بیاید:
#
#     sudo bash install.sh
#
#  این اسکریپت: Node.js، سرور بازی، سرویس systemd، Nginx و گواهی SSL رایگان
#  را نصب و تنظیم می‌کند.
# ============================================================================
set -euo pipefail

DOMAIN="${1:-}"
APP_DIR="/var/www/pasur11"
REPO="https://github.com/smahdi2razavi-code/Pasur11.git"
BRANCH="claude/screen-server-gateway-issues-0jyp6m"

say()  { printf '\n\033[1;36m▸ %s\033[0m\n' "$*"; }
ok()   { printf '\033[1;32m  ✔ %s\033[0m\n' "$*"; }
warn() { printf '\033[1;33m  ! %s\033[0m\n' "$*"; }
die()  { printf '\n\033[1;31m✖ %s\033[0m\n' "$*"; exit 1; }

[ "$(id -u)" -eq 0 ] || die "این اسکریپت را با sudo اجرا کنید:  sudo bash install.sh $DOMAIN"

say "۱/۶  به‌روزرسانی فهرست بسته‌ها"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq curl git ca-certificates >/dev/null
ok "انجام شد"

say "۲/۶  نصب Node.js نسخهٔ ۲۰"
NODE_MAJOR=0
if command -v node >/dev/null 2>&1; then
  NODE_MAJOR="$(node -v | sed 's/v\([0-9]*\).*/\1/')"
fi
if [ "$NODE_MAJOR" -lt 18 ]; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash - >/dev/null 2>&1
  apt-get install -y -qq nodejs >/dev/null
fi
command -v node >/dev/null 2>&1 || die "نصب Node.js ناموفق بود"
ok "Node.js $(node -v)"

say "۳/۶  گرفتن فایل‌های بازی"
if [ -d "$APP_DIR/.git" ]; then
  git -C "$APP_DIR" fetch --depth 1 origin "$BRANCH" -q
  git -C "$APP_DIR" checkout -q -B main "origin/$BRANCH"
  ok "به آخرین نسخه به‌روزرسانی شد"
else
  rm -rf "$APP_DIR"
  git clone --depth 1 -b "$BRANCH" -q "$REPO" "$APP_DIR"
  ok "دانلود شد در $APP_DIR"
fi
[ -f "$APP_DIR/server/server.js" ] || die "فایل server/server.js پیدا نشد"

say "۴/۶  ساخت سرویس دائمی"
id -u www-data >/dev/null 2>&1 || useradd -r -s /usr/sbin/nologin www-data
mkdir -p "$APP_DIR/server/data"
chown -R www-data:www-data "$APP_DIR/server"

NODE_BIN="$(command -v node)"
cat > /etc/systemd/system/pasur11.service <<EOF
[Unit]
Description=Pasur11 Game API
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=$APP_DIR/server
ExecStart=$NODE_BIN $APP_DIR/server/server.js
Environment=PORT=8080
Environment=HOST=127.0.0.1
Restart=always
RestartSec=3
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable pasur11 >/dev/null 2>&1
systemctl restart pasur11
sleep 2
systemctl is-active --quiet pasur11 || die "سرور بالا نیامد. برای دیدن علت:  journalctl -u pasur11 -n 40"
ok "سرویس pasur11 روشن است"

say "۵/۶  آزمایش سرور"
HEALTH="$(curl -s --max-time 8 http://127.0.0.1:8080/api/health || true)"
case "$HEALTH" in
  *'"ok":true'*) ok "پاسخ سالم گرفت" ;;
  *) die "سرور پاسخ درست نداد. برای دیدن علت:  journalctl -u pasur11 -n 40" ;;
esac
case "$HEALTH" in
  *'"iap":true'*) ok "کلید مایکت بارگذاری شد" ;;
  *) warn "کلید مایکت تنظیم نشده — فایل server/config.json را بررسی کنید" ;;
esac

if [ -z "$DOMAIN" ]; then
  say "۶/۶  بدون دامنه"
  IP="$(curl -s --max-time 8 https://api.ipify.org || echo 'آی‌پی-سرور')"
  systemctl stop pasur11
  sed -i 's/Environment=HOST=127.0.0.1/Environment=HOST=0.0.0.0/' /etc/systemd/system/pasur11.service
  systemctl daemon-reload && systemctl start pasur11
  warn "بدون دامنه و SSL راه افتاد. آدرس سرور شما:"
  printf '\n      \033[1;33mhttp://%s:8080\033[0m\n\n' "$IP"
  warn "بازی روی HTTPS اجرا می‌شود و مرورگر اجازهٔ تماس با آدرس http را نمی‌دهد."
  warn "برای استفادهٔ واقعی حتماً یک دامنه بگیرید و دوباره اجرا کنید:"
  printf '      sudo bash install.sh دامنهٔ-شما\n\n'
  exit 0
fi

say "۶/۶  نصب Nginx و گواهی SSL برای $DOMAIN"
apt-get install -y -qq nginx certbot python3-certbot-nginx >/dev/null

cat > /etc/nginx/sites-available/pasur11 <<EOF
server {
    listen 80;
    server_name $DOMAIN;

    location /api/ {
        proxy_pass         http://127.0.0.1:8080;
        proxy_http_version 1.1;
        proxy_set_header   Host \$host;
        proxy_set_header   X-Forwarded-For \$remote_addr;
        proxy_set_header   X-Forwarded-Proto \$scheme;
        proxy_read_timeout 30s;
    }

    location / {
        return 200 'Pasur11 API is running';
        add_header Content-Type text/plain;
    }
}
EOF

ln -sf /etc/nginx/sites-available/pasur11 /etc/nginx/sites-enabled/pasur11
rm -f /etc/nginx/sites-enabled/default
nginx -t >/dev/null 2>&1 || die "تنظیمات Nginx مشکل دارد"
systemctl reload nginx
ok "Nginx تنظیم شد"

if certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos --register-unsafely-without-email --redirect >/dev/null 2>&1; then
  ok "گواهی SSL گرفته شد"
  BASE="https://$DOMAIN"
else
  warn "گرفتن گواهی SSL ناموفق بود."
  warn "معمولاً یعنی دامنه هنوز به آی‌پی این سرور اشاره نمی‌کند، یا پورت ۸۰ بسته است."
  warn "بعد از درست کردن دامنه، این را بزنید:  sudo certbot --nginx -d $DOMAIN"
  BASE="http://$DOMAIN"
fi

printf '\n\033[1;32m══════════════════════════════════════════════════\033[0m\n'
printf '\033[1;32m  نصب تمام شد ✔\033[0m\n\n'
printf '  آدرس سرور شما:\n\n      \033[1;33m%s\033[0m\n\n' "$BASE"
printf '  حالا در فایل index.html این خط را پر کنید:\n\n'
printf "      const DEFAULT_API_BASE='%s';\n\n" "$BASE"
printf '  آزمایش از روی مرورگر خودتان:\n\n      %s/api/health\n\n' "$BASE"
printf '  دیدن لاگ سرور:      journalctl -u pasur11 -f\n'
printf '  خاموش/روشن کردن:    sudo systemctl restart pasur11\n'
printf '\033[1;32m══════════════════════════════════════════════════\033[0m\n\n'
