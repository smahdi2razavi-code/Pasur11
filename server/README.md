# سرور بازی پاسور ۱۱

سرور سبک و بدون کتابخانهٔ بیرونی، مخصوص سرور مجازی/ابری (پارس‌پک، آروان، لیارا، …).
فقط به **Node.js نسخهٔ ۱۸ یا بالاتر** نیاز دارد.

## چه کارهایی می‌کند

| بخش | مسیر | توضیح |
|---|---|---|
| سلامت سرور | `GET /api/health` | برای بررسی سریع بالا بودن سرور |
| بازی دو نفره | `POST /api/mp/session` | ساخت کد ۷ رقمی |
| | `GET /api/mp/session/:code` | گرفتن offer میزبان |
| | `POST /api/mp/session/:code/answer` | ثبت پاسخ بازیکن دوم |
| | `GET /api/mp/session/:code/answer` | چک‌کردن پاسخ توسط میزبان |
| | `DELETE /api/mp/session/:code` | حذف کد بعد از اتصال |
| جدول رتبه | `GET/POST /api/leaderboard` | ثبت و نمایش برترین‌ها |
| نام‌کاربری | `POST /api/username/claim` | یکتا نگه‌داشتن نام‌کاربری |
| خرید مایکت | `POST /api/iap/myket/verify` | بررسی امضای رسید و ثبت جایزه |
| بازیابی خرید | `GET /api/iap/purchases?deviceId=` | موجودی و سفارش‌های یک دستگاه |

---

## نصب خودکار (پیشنهادی — یک دستور)

اگر با ترمینال راحت نیستید، این ساده‌ترین راه است. وارد سرور شوید و این را بزنید:

```bash
curl -fsSL https://raw.githubusercontent.com/smahdi2razavi-code/Pasur11/claude/screen-server-gateway-issues-0jyp6m/server/install.sh -o install.sh
sudo bash install.sh دامنهٔ-شما
```

مثلاً:
```bash
sudo bash install.sh api.pasur11.ir
```

این اسکریپت خودش Node.js، سرور بازی، سرویس دائمی، Nginx و گواهی SSL رایگان را
نصب و تنظیم می‌کند و در پایان **آدرس سرور شما** را چاپ می‌کند.

> اگر هنوز دامنه ندارید، بدون آن اجرا کنید (`sudo bash install.sh`) تا فقط روی
> آی‌پی بالا بیاید. ولی برای استفادهٔ واقعی **حتماً دامنه و SSL لازم است**،
> چون بازی روی HTTPS اجرا می‌شود و مرورگر اجازهٔ تماس با آدرس `http` را نمی‌دهد.

---

## نصب دستی (اگر می‌خواهید خودتان قدم‌به‌قدم جلو بروید)

### ۱. نصب Node.js
```bash
sudo apt update
sudo apt install -y nodejs npm nginx certbot python3-certbot-nginx
node -v          # باید ۱۸ یا بالاتر باشد
```
اگر نسخهٔ Node قدیمی بود:
```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
```

### ۲. کپی کردن فایل‌ها
```bash
sudo mkdir -p /var/www/pasur11
sudo chown -R $USER:$USER /var/www/pasur11
cd /var/www/pasur11
git clone https://github.com/smahdi2razavi-code/Pasur11.git .
```

### ۳. تست دستی
```bash
cd /var/www/pasur11/server
node server.js
```
باید ببینید:
```
 مایکت : کلید عمومی بارگذاری شد ✔
```
با `Ctrl+C` ببندید.

### ۴. اجرای دائمی با systemd
```bash
sudo cp /var/www/pasur11/server/pasur11.service /etc/systemd/system/
sudo chown -R www-data:www-data /var/www/pasur11/server
sudo systemctl daemon-reload
sudo systemctl enable --now pasur11
sudo systemctl status pasur11
```
دیدن لاگ‌ها:
```bash
sudo journalctl -u pasur11 -f
```

### ۵. Nginx + گواهی SSL
> **مهم:** بازی حتماً باید از `https` سرور را صدا بزند؛ اگر بازی روی HTTPS باشد و
> سرور روی HTTP، مرورگر جلوی درخواست را می‌گیرد (Mixed Content) و هیچ‌چیز کار نمی‌کند.

فایل `/etc/nginx/sites-available/pasur11`:
```nginx
server {
    listen 80;
    server_name api.example.ir;          # دامنهٔ خودتان

    location /api/ {
        proxy_pass         http://127.0.0.1:8080;
        proxy_http_version 1.1;
        proxy_set_header   Host $host;
        proxy_set_header   X-Forwarded-For $remote_addr;
        proxy_set_header   X-Forwarded-Proto $scheme;
        proxy_read_timeout 30s;
    }
}
```
فعال‌سازی و گرفتن گواهی:
```bash
sudo ln -s /etc/nginx/sites-available/pasur11 /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d api.example.ir
```

### ۶. وصل کردن بازی به سرور
در `index.html` این یک خط را پیدا و پر کنید:
```js
const DEFAULT_API_BASE='';        //  ← آدرس سرور را اینجا بگذارید
```
```js
const DEFAULT_API_BASE='https://api.example.ir';
```
همین. آدرس سرور عمداً به کاربر نشان داده نمی‌شود و فقط از همین خط خوانده
می‌شود. تا وقتی این خط خالی باشد، بازی کاملاً آفلاین و بدون هیچ خطایی کار
می‌کند: بازی دو نفره با روش کد دستی و جدول رتبه به‌صورت محلی.

---

## تنظیمات (`config.json`)

| کلید | توضیح |
|---|---|
| `port` | پورت سرور (پیش‌فرض ۸۰۸۰) |
| `host` | با Nginx بگذارید `127.0.0.1` |
| `allowedOrigins` | دامنه‌های مجاز؛ `["*"]` یعنی همه |
| `myketPublicKey` | کلید عمومی RSA از پنل مایکت (همین الان تنظیم شده) |
| `skipSignature` | فقط برای تست محلی `true`؛ روی سرور واقعی حتماً `false` |
| `sessionTtlMinutes` | مدت اعتبار کد ۷ رقمی (پیش‌فرض ۱۰ دقیقه) |
| `products` | جایزهٔ هر شناسهٔ محصول مایکت |

همهٔ این‌ها با متغیر محیطی هم قابل تنظیم‌اند و متغیر محیطی اولویت دارد:
`PORT`، `HOST`، `ALLOWED_ORIGINS`، `MYKET_PUBLIC_KEY`، `SKIP_SIGNATURE`، `TLS_CERT`، `TLS_KEY`.

مثال (بدون دست زدن به فایل):
```bash
MYKET_PUBLIC_KEY="MIGf..." PORT=8080 node server.js
```

## محصولات

شناسه‌ها دقیقاً مطابق پنل مایکت هستند:

| شناسه | محصول | جایزه |
|---|---|---|
| `coins_500` | ۵۰۰ سکه | ۵۰۰ سکه + ۱ بلیط |
| `coins_1500` | ۱٬۵۰۰ سکه | ۱۵۰۰ سکه + ۳ بلیط |
| `coins_4000` | ۴٬۰۰۰ سکه | ۴۰۰۰ سکه + ۱۰ بلیط |
| `vip_subscription` | VIP ۱ ماهه | ۳۰ روز + ۳ بلیط |
| `vip_subscription_2` | VIP ۲ ماهه | ۶۰ روز + ۷ بلیط |
| `vip_subscription_3` | VIP ۳ ماهه | ۹۰ روز + ۱۲ بلیط |

اگر در پنل مایکت محصول جدیدی ساختید، فقط در `config.json` زیر `products`
یک ردیف اضافه کنید و در `index.html` هم به `IAP_PRODUCTS` اضافه‌اش کنید.

## داده‌ها و پشتیبان‌گیری

همه‌چیز در `server/data/db.json` است (این پوشه در گیت نادیده گرفته می‌شود).
پشتیبان روزانه:
```bash
0 3 * * * cp /var/www/pasur11/server/data/db.json /var/backups/pasur11-$(date +\%F).json
```

## عیب‌یابی

| نشانه | علت و راه‌حل |
|---|---|
| بازی به سرور وصل نمی‌شود | سرور روشن است؟ `sudo systemctl status pasur11` — پورت باز است؟ — HTTPS دارد؟ برای تست دستی: `curl https://api.example.ir/api/health` |
| کد ۷ رقمی ساخته نمی‌شود | `DEFAULT_API_BASE` در `index.html` پر نشده، یا Mixed Content (بازی HTTPS، سرور HTTP) |
| خرید تأیید نمی‌شود (`bad-signature`) | کلید عمومی در `config.json` با پنل مایکت یکی نیست |
| `unknown-sku` | شناسهٔ محصول در `config.json` نیست |
| جدول رتبه خالی | هنوز کسی با نام‌کاربری ثبت نشده؛ اول در بازی username بگیرید |
