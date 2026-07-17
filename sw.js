/* سرویس‌ورکر پاسور ۱۱
   - صفحهٔ بازی: اول از اینترنت (تا هر تغییری که روی گیت‌هاب می‌گذارید فوراً به کاربران برسد)،
     و اگر اینترنت نبود از نسخهٔ ذخیره‌شده (بازی آفلاین).
   - عکس کارت‌ها و بقیهٔ فایل‌ها: اول از حافظه (سرعت)، و اگر نبود از اینترنت.
   نکته: هر وقت تغییر بزرگی دادید، عدد نسخهٔ زیر را یکی بالا ببرید (v1 → v2). */
const CACHE = 'pasur11-v1';

self.addEventListener('install', e => { self.skipWaiting(); });

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
  const isPage = req.mode === 'navigate' || req.url.endsWith('.html') || req.url.endsWith('/');
  if (isPage) {
    // شبکه-اول: آخرین نسخهٔ بازی همیشه اولویت دارد
    e.respondWith(
      fetch(req).then(res => {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(req, copy));
        return res;
      }).catch(() => caches.match(req).then(hit => hit || caches.match('index.html')))
    );
  } else {
    // حافظه-اول: عکس کارت‌ها و فایل‌های ثابت
    e.respondWith(
      caches.match(req).then(hit => hit || fetch(req).then(res => {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(req, copy));
        return res;
      }))
    );
  }
});
