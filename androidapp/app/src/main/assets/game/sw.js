/* سرویس‌ورکر پاسور ۱۱
   - نصب: فایل‌های اصلی بازی از همان اول در حافظهٔ گوشی ذخیره می‌شوند (پایهٔ اجرای آفلاین و نصب از کروم)
   - صفحهٔ بازی: اول از اینترنت (تا هر تغییری که روی گیت‌هاب می‌گذارید فوراً به کاربران برسد)،
     و اگر اینترنت نبود از نسخهٔ ذخیره‌شده (بازی کاملاً آفلاین اجرا می‌شود).
   - عکس کارت‌ها، آیکون‌ها و بقیهٔ فایل‌ها: اول از حافظه (سرعت)، و اگر نبود از اینترنت.
   - درخواست‌های سرور بازی (/api/...) هرگز کش نمی‌شوند؛ وگرنه کد اتصال، جدول رتبه
     و تأیید خرید، پاسخ کهنه می‌گرفتند.
   نکته: هر وقت تغییر بزرگی دادید، عدد نسخهٔ زیر را یکی بالا ببرید (v2 → v3). */
const CACHE = 'pasur11-v2';
const CORE = ['./', 'index.html', 'manifest.json', 'icon-192.png', 'icon-512.png'];

self.addEventListener('install', e => {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(CORE)).catch(() => {})
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;

  let url;
  try { url = new URL(req.url); } catch (err) { return; }
  if (url.origin !== location.origin) return; // سرور بازی و اسکریپت‌های خارجی دست‌نخورده بمانند
  if (url.pathname.startsWith('/api/')) return; // پاسخ سرور هیچ‌وقت از حافظه داده نمی‌شود

  const isPage = req.mode === 'navigate' || url.pathname.endsWith('.html') || url.pathname.endsWith('/');
  if (isPage) {
    // شبکه-اول: آخرین نسخهٔ بازی همیشه اولویت دارد؛ آفلاین → نسخهٔ ذخیره‌شده
    e.respondWith(
      fetch(req).then(res => {
        if (res && res.ok && res.type === 'basic') {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {});
        }
        return res;
      }).catch(() =>
        caches.match(req).then(hit => hit || caches.match('index.html').then(h2 => h2 || caches.match('./')))
      )
    );
  } else {
    // حافظه-اول: عکس کارت‌ها و فایل‌های ثابت
    e.respondWith(
      caches.match(req).then(hit => hit || fetch(req).then(res => {
        // پاسخ‌های ناموفق (مثلاً ۴۰۴ کارت‌های نبوده) ذخیره نمی‌شوند
        if (res && res.ok && res.type === 'basic') {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {});
        }
        return res;
      }))
    );
  }
});
