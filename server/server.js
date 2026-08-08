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
let DB = { sessions:{}, leaderboard:{}, usernames:{}, users:{}, control:{}, friendreq:{}, backup:{}, broadcast:null, broadcastLog:[] };
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
    // حذف رکورد قدیمی هنگام تغییر نام‌کاربری (جلوگیری از اکانت تکراری)
    if (method === 'DELETE' && a) { delete DB.leaderboard[a]; saveDB(); return sendJSON(res, 200, null); }
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
      const prev = DB.users[a];
      // «first» = نخستین باری که این کاربر دیده شده (برای نمودار کاربران تازه)
      DB.users[a] = Object.assign({}, body, {
        first: (prev && prev.first) || Date.now(),
        ts: Date.now()
      });
      saveDB(); return sendJSON(res, 200, body);
    }
    if (method === 'GET' && a)  return sendJSON(res, 200, DB.users[a] || null);
    // حذف کامل اکانت (فقط با کلید مدیریت)
    if (method === 'DELETE' && a) {
      if (getKey(req.url) !== ADMIN_KEY) return sendJSON(res, 403, { error: 'forbidden' });
      const u = DB.users[a];
      delete DB.users[a];
      if (DB.friendreq) delete DB.friendreq[a];
      if (u && u.user) { delete DB.leaderboard[u.user]; delete DB.usernames[u.user]; }
      // نشانهٔ حذف باقی می‌ماند تا بازی روی گوشی هم داده‌های محلی را پاک کند
      DB.control[a] = { deleted: true, ts: Date.now() };
      saveDB(); return sendJSON(res, 200, { deleted: true });
    }
    if (method === 'GET' && !a) {
      // فهرست کامل کاربران فقط با کلید مدیریت
      const key = getKey(req.url);
      if (key !== ADMIN_KEY) return sendJSON(res, 403, { error: 'forbidden' });
      return sendJSON(res, 200, DB.users);
    }
  }

  /* ===== ۵) درخواست‌های دوستی: /friendreq/<گیرنده>/<فرستنده> ===== */
  if (root === 'friendreq') {
    DB.friendreq = DB.friendreq || {};
    if (method === 'GET' && a && !b) return sendJSON(res, 200, DB.friendreq[a] || null);
    if (method === 'PUT' && a && b) {
      const body = await readBody(req);
      DB.friendreq[a] = DB.friendreq[a] || {};
      DB.friendreq[a][b] = Object.assign({}, body, { ts: Date.now() });
      saveDB(); return sendJSON(res, 200, body);
    }
    if (method === 'DELETE' && a && b) {
      if (DB.friendreq[a]) delete DB.friendreq[a][b];
      saveDB(); return sendJSON(res, 200, null);
    }
  }

  /* ===== ۶) اعلان همگانی ===== */
  if (root === 'broadcast') {
    if (method === 'GET' && a === 'log') {          // تاریخچهٔ اعلان‌ها
      if (getKey(req.url) !== ADMIN_KEY) return sendJSON(res, 403, { error: 'forbidden' });
      return sendJSON(res, 200, DB.broadcastLog || []);
    }
    if (method === 'GET') return sendJSON(res, 200, DB.broadcast || null);
    if (method === 'PUT') {
      if (getKey(req.url) !== ADMIN_KEY) return sendJSON(res, 403, { error: 'forbidden' });
      const body = await readBody(req);
      DB.broadcast = body ? Object.assign({}, body, { id: Date.now() }) : null;
      if (DB.broadcast) {                            // نگهداری ۲۰ اعلان اخیر
        DB.broadcastLog = (DB.broadcastLog || []).concat([DB.broadcast]).slice(-20);
      }
      saveDB(); return sendJSON(res, 200, DB.broadcast);
    }
    if (method === 'DELETE') {
      if (getKey(req.url) !== ADMIN_KEY) return sendJSON(res, 403, { error: 'forbidden' });
      DB.broadcast = null; saveDB(); return sendJSON(res, 200, null);
    }
  }

  /* ===== ۷) پشتیبان‌گیری حساب با ایمیل ===== */
  if (root === 'backup') {
    DB.backup = DB.backup || {};
    if (method === 'GET' && a) return sendJSON(res, 200, DB.backup[a.toLowerCase()] || null);
    if (method === 'PUT' && a) {
      const body = await readBody(req);
      DB.backup[a.toLowerCase()] = Object.assign({}, body, { ts: Date.now() });
      saveDB(); return sendJSON(res, 200, { ok: true });
    }
  }

  if (root === 'control') {
    // فهرست کامل دستورها، یکجا (پنل با یک درخواست همه را می‌گیرد)
    if (method === 'GET' && !a) {
      if (getKey(req.url) !== ADMIN_KEY) return sendJSON(res, 403, { error: 'forbidden' });
      return sendJSON(res, 200, DB.control);
    }
    if (method === 'GET' && a && !b) return sendJSON(res, 200, DB.control[a] || null);
    // پاک‌کردن همهٔ دستورهای در انتظارِ یک کاربر
    if (method === 'DELETE' && a && !b) {
      if (getKey(req.url) !== ADMIN_KEY) return sendJSON(res, 403, { error: 'forbidden' });
      const c = DB.control[a];
      if (c) ['coinGrant','vipGrant','msg','scoreGrant','setProgress'].forEach(k => delete c[k]);
      saveDB(); return sendJSON(res, 200, { cleared: true });
    }
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

  /* ===== ۸) آمار کلی برای پنل مدیریت ===== */
  if (root === 'stats' && method === 'GET') {
    if (getKey(req.url) !== ADMIN_KEY) return sendJSON(res, 403, { error: 'forbidden' });
    const now = Date.now(), DAY = 86400000;
    const ids = Object.keys(DB.users);
    let vip = 0, coins = 0, trophies = 0, levelSum = 0, a1 = 0, a7 = 0, a30 = 0;
    const seenDay = {}, newDay = {};
    const dayKey = t => new Date(t).toISOString().slice(0, 10);
    for (const id of ids) {
      const u = DB.users[id] || {};
      if (u.vip) vip++;
      coins    += Number(u.coins)    || 0;
      trophies += Number(u.trophies) || 0;
      levelSum += Number(u.level)    || 1;
      const ts = Number(u.ts) || 0, age = now - ts;
      if (age < DAY)      a1++;
      if (age < 7  * DAY) a7++;
      if (age < 30 * DAY) a30++;
      if (ts) seenDay[dayKey(ts)] = (seenDay[dayKey(ts)] || 0) + 1;
      if (u.first) newDay[dayKey(u.first)] = (newDay[dayKey(u.first)] || 0) + 1;
    }
    let banned = 0, pending = 0;
    const PEND = ['coinGrant', 'vipGrant', 'msg', 'scoreGrant', 'setProgress'];
    for (const id of Object.keys(DB.control)) {
      const c = DB.control[id] || {};
      if (c.banned) banned++;
      if (PEND.some(k => c[k])) pending++;
    }
    // ۱۴ روز اخیر برای نمودار
    const days = [];
    for (let i = 13; i >= 0; i--) {
      const d = dayKey(now - i * DAY);
      days.push({ d, seen: seenDay[d] || 0, neu: newDay[d] || 0 });
    }
    let dataSize = 0;
    try { dataSize = fs.statSync(DATA_FILE).size; } catch (e) {}
    return sendJSON(res, 200, {
      users: ids.length, vip, banned, pending,
      active1: a1, active7: a7, active30: a30,
      coins, trophies,
      avgLevel: ids.length ? +(levelSum / ids.length).toFixed(1) : 0,
      board: Object.keys(DB.leaderboard).length,
      sessions: Object.keys(DB.sessions).length,
      friendreq: Object.keys(DB.friendreq || {}).length,
      broadcast: DB.broadcast || null,
      days, dataSize,
      uptime: Math.floor(process.uptime()),
      time: now
    });
  }

  /* ===== ۹) فهرست نشست‌های بازی دو نفره (زنده) ===== */
  if (root === 'sessions' && method === 'GET' && !a) {
    if (getKey(req.url) !== ADMIN_KEY) return sendJSON(res, 403, { error: 'forbidden' });
    const out = Object.keys(DB.sessions).map(code => {
      const s = DB.sessions[code] || {};
      return { code, ts: s.ts || 0, answered: !!s.answer };
    }).sort((x, y) => y.ts - x.ts);
    return sendJSON(res, 200, out);
  }

  /* ===== ۱۰) عملیات گروهی: یک دستور برای چند کاربر ===== */
  if (root === 'bulk' && method === 'PUT') {
    if (getKey(req.url) !== ADMIN_KEY) return sendJSON(res, 403, { error: 'forbidden' });
    const body = await readBody(req) || {};
    const field = String(body.field || '');
    const ALLOWED = ['coinGrant', 'scoreGrant', 'vipGrant', 'msg', 'banned'];
    if (ALLOWED.indexOf(field) < 0) return sendJSON(res, 400, { error: 'bad field' });
    let ids = Array.isArray(body.ids) ? body.ids : [];
    if (!ids.length) return sendJSON(res, 400, { error: 'no ids' });
    if (ids.length > 5000) ids = ids.slice(0, 5000);
    const add = (field === 'coinGrant' || field === 'scoreGrant') && body.mode !== 'set';
    let n = 0;
    for (const id of ids) {
      if (typeof id !== 'string' || !id) continue;
      DB.control[id] = DB.control[id] || {};
      if (add) {
        const cur = Number(DB.control[id][field]) || 0;
        DB.control[id][field] = cur + (Number(body.value) || 0);
      } else {
        DB.control[id][field] = body.value;
      }
      n++;
    }
    saveDB();
    return sendJSON(res, 200, { ok: true, count: n, field });
  }

  /* ===== ۱۱) خروجی کامل داده‌ها (پشتیبان) ===== */
  if (root === 'export' && method === 'GET') {
    if (getKey(req.url) !== ADMIN_KEY) return sendJSON(res, 403, { error: 'forbidden' });
    return sendJSON(res, 200, DB);
  }

  return sendJSON(res, 404, { error: 'not found' });
 } catch (e) {
  console.error('request error:', e && e.message);
  try { sendJSON(res, 500, { error: 'server error' }); } catch (e2) {}
 }
});
server.on('clientError', (err, socket) => { try { socket.destroy(); } catch (e) {} });

server.listen(PORT, () => console.log('سرور پاسور ۱۱ روی پورت ' + PORT + ' اجرا شد'));
