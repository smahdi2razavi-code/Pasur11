/* ============================================================================
 *  سرور پاسور ۱۱  —  جایگزین Firebase، مخصوص میزبانی ایرانی (لیارا)
 *  ----------------------------------------------------------------------------
 *  این سرور چهار کار انجام می‌دهد:
 *    ۱) اتصال بازی دو نفره (کد کوتاه ۷ رقمی برای آشناکردن دو گوشی)
 *    ۲) جدول رتبه‌بندی جهانی
 *    ۳) یکتایی نام‌کاربری
 *    ۴) مدیریت کاربران (برای ربات تلگرام): سکه، VIP، مسدودسازی
 *
 *  بدون هیچ دیتابیس بیرونی کار می‌کند (داده‌ها در یک فایل JSON ذخیره می‌شوند)،
 *  پس روی پلن رایگان لیارا هم بدون دردسر اجرا می‌شود.
 * ========================================================================== */

const http = require('http');
const fs   = require('fs');
const path = require('path');

const PORT      = process.env.PORT || 3000;
const ADMIN_KEY = process.env.ADMIN_KEY || 'CHANGE_ME_SECRET';  // برای ربات تلگرام
const DATA_FILE = process.env.DATA_FILE || path.join(__dirname, 'data.json');

/* ---------- ذخیره‌سازی ساده روی فایل ---------- */
let DB = { sessions:{}, leaderboard:{}, usernames:{}, users:{}, control:{} };
try { if (fs.existsSync(DATA_FILE)) DB = Object.assign(DB, JSON.parse(fs.readFileSync(DATA_FILE,'utf8'))); }
catch (e) { console.error('خواندن داده‌ها ناموفق بود:', e.message); }

// اگر پوشهٔ فایل داده وجود ندارد، ساخته می‌شود (برای میزبان‌های مختلف)
try { fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true }); } catch (e) {}

let saveTimer = null;
function saveDB() {                      // ذخیرهٔ کم‌هزینه (حداکثر هر ۲ ثانیه یک‌بار)
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    try {
      fs.writeFileSync(DATA_FILE + '.tmp', JSON.stringify(DB));   // نوشتن امن
      fs.renameSync(DATA_FILE + '.tmp', DATA_FILE);
    } catch (e) { console.error('ذخیرهٔ داده‌ها ناموفق بود:', e.message); }
  }, 2000);
}

/* ---------- پاک‌سازی کدهای اتصال قدیمی (هر ۱۰ دقیقه) ---------- */
setInterval(() => {
  const now = Date.now(), TTL = 15 * 60 * 1000;   // ۱۵ دقیقه
  let changed = false;
  for (const code of Object.keys(DB.sessions)) {
    if (now - (DB.sessions[code].ts || 0) > TTL) { delete DB.sessions[code]; changed = true; }
  }
  if (changed) saveDB();
}, 10 * 60 * 1000);

/* ---------- ابزارها ---------- */
function sendJSON(res, code, obj) {
  const body = JSON.stringify(obj === undefined ? null : obj);
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,PUT,POST,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Cache-Control': 'no-store'
  });
  res.end(body);
}
function readBody(req) {
  return new Promise(resolve => {
    let d = '';
    req.on('data', c => { d += c; if (d.length > 1e6) req.destroy(); });
    req.on('end', () => { try { resolve(d ? JSON.parse(d) : null); } catch (e) { resolve(null); } });
  });
}
// مسیرهای سازگار با Firebase: /leaderboard/ali.json → ['leaderboard','ali']
function parsePath(url) {
  const clean = String(url || '').split('?')[0].replace(/\.json$/, '');
  return clean.split('/').filter(Boolean).map(p => {
    try { return decodeURIComponent(p); } catch (e) { return p; }   // آدرس خراب سرور را نیندازد
  });
}
// خواندن امن پارامتر ?key=
function getKey(url) {
  try { return new URL(url, 'http://x').searchParams.get('key'); } catch (e) { return null; }
}
// هیچ خطای پیش‌بینی‌نشده‌ای نباید سرور را از کار بیندازد
process.on('uncaughtException',  e => console.error('uncaughtException:', e && e.message));
process.on('unhandledRejection', e => console.error('unhandledRejection:', e && e.message));

/* ---------- سرور ---------- */
const server = http.createServer(async (req, res) => {
 try {
  if (req.method === 'OPTIONS') return sendJSON(res, 200, null);

  const parts  = parsePath(req.url);
  const method = req.method;

  // بررسی سلامت سرور
  if (parts.length === 0 || parts[0] === 'health') {
    return sendJSON(res, 200, { ok: true, name: 'pasur11-server', time: Date.now() });
  }

  const [root, a, b] = parts;

  /* ===== ۱) اتصال بازی دو نفره ===== */
  if (root === 'sessions') {
    if (method === 'PUT' && a && !b) {                 // میزبان: ثبت پیشنهاد اتصال
      const body = await readBody(req);
      DB.sessions[a] = Object.assign({}, body, { ts: Date.now() });
      saveDB(); return sendJSON(res, 200, body);
    }
    if (method === 'PUT' && a && b === 'answer') {     // مهمان: ثبت پاسخ
      if (!DB.sessions[a]) return sendJSON(res, 200, null);
      DB.sessions[a].answer = await readBody(req);
      DB.sessions[a].ts = Date.now();
      saveDB(); return sendJSON(res, 200, DB.sessions[a].answer);
    }
    if (method === 'GET' && a && b === 'answer') return sendJSON(res, 200, (DB.sessions[a]||{}).answer || null);
    if (method === 'GET' && a) return sendJSON(res, 200, DB.sessions[a] || null);
    if (method === 'DELETE' && a) { delete DB.sessions[a]; saveDB(); return sendJSON(res, 200, null); }
  }

  /* ===== ۲) جدول رتبه‌بندی ===== */
  if (root === 'leaderboard') {
    if (method === 'PUT' && a) {
      const body = await readBody(req);
      DB.leaderboard[a] = Object.assign({}, body, { ts: Date.now() });
      saveDB(); return sendJSON(res, 200, body);
    }
    if (method === 'GET' && !a) return sendJSON(res, 200, DB.leaderboard);
    if (method === 'GET' && a)  return sendJSON(res, 200, DB.leaderboard[a] || null);
  }

  /* ===== ۳) یکتایی نام‌کاربری ===== */
  if (root === 'usernames') {
    if (method === 'GET' && a) return sendJSON(res, 200, DB.usernames[a] || null);
    if (method === 'PUT' && a) {
      const body = await readBody(req);
      DB.usernames[a] = body; saveDB(); return sendJSON(res, 200, body);
    }
    if (method === 'DELETE' && a) { delete DB.usernames[a]; saveDB(); return sendJSON(res, 200, null); }
  }

  /* ===== ۴) کاربران و دستورهای مدیریتی ===== */
  if (root === 'users') {
    if (method === 'PUT' && a) {
      const body = await readBody(req);
      DB.users[a] = Object.assign({}, body, { ts: Date.now() });
      saveDB(); return sendJSON(res, 200, body);
    }
    if (method === 'GET' && a)  return sendJSON(res, 200, DB.users[a] || null);
    if (method === 'GET' && !a) {
      // فهرست کامل کاربران فقط با کلید مدیریت
      const key = getKey(req.url);
      if (key !== ADMIN_KEY) return sendJSON(res, 403, { error: 'forbidden' });
      return sendJSON(res, 200, DB.users);
    }
  }

  if (root === 'control') {
    if (method === 'GET' && a && !b) return sendJSON(res, 200, DB.control[a] || null);
    // نوشتن دستور مدیریتی: از سمت بازی فقط صفرکردن مجاز است؛ بقیه کلید می‌خواهد
    if (method === 'PUT' && a && b) {
      const body = await readBody(req);
      const key  = getKey(req.url);
      const clearing = (body === 0 || body === false || body === '0' || body === 'false');
      if (!clearing && key !== ADMIN_KEY) return sendJSON(res, 403, { error: 'forbidden' });
      DB.control[a] = DB.control[a] || {};
      DB.control[a][b] = body;
      saveDB(); return sendJSON(res, 200, body);
    }
  }

  return sendJSON(res, 404, { error: 'not found' });
 } catch (e) {
  console.error('request error:', e && e.message);
  try { sendJSON(res, 500, { error: 'server error' }); } catch (e2) {}
 }
});
server.on('clientError', (err, socket) => { try { socket.destroy(); } catch (e) {} });

server.listen(PORT, () => console.log('سرور پاسور ۱۱ روی پورت ' + PORT + ' اجرا شد'));
