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

const http   = require('http');
const fs     = require('fs');
const path   = require('path');
const crypto = require('crypto');

const PORT      = process.env.PORT || 3000;
const ADMIN_KEY = process.env.ADMIN_KEY || 'CHANGE_ME_SECRET';  // برای پنل مدیریت
const DATA_FILE = process.env.DATA_FILE || path.join(__dirname, 'data.json');

/* ---------- سقف‌های ایمنی (جلوگیری از پرشدن دیسک و خرابکاری) ---------- */
const MAX_USERS     = Number(process.env.MAX_USERS)     || 100000;
const MAX_DATA_MB   = Number(process.env.MAX_DATA_MB)   || 100;
const RATE_PER_MIN  = Number(process.env.RATE_PER_MIN)  || 300;   // درخواست در دقیقه از هر IP
const MAX_TROPHIES  = 1000000;
const MAX_LEVEL     = 500;

/* ---------- ذخیره‌سازی ساده روی فایل ---------- */
let DB = { sessions:{}, leaderboard:{}, usernames:{}, users:{}, control:{}, friendreq:{}, backup:{}, broadcast:null, broadcastLog:[], tickets:{}, secrets:{} };
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
    'Access-Control-Allow-Headers': 'Content-Type, X-Admin-Key, X-Admin-Token, X-User-Key',
    'Access-Control-Max-Age': '86400',
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
/* ---------- کلید مدیریت ----------
 * روش تازه: هدر  X-Admin-Key   (کلید در آدرس نمی‌افتد و در لاگ‌ها ثبت نمی‌شود)
 * روش قدیمی: ?key=...          (برای سازگاری با پنل‌های قدیمی نگه داشته شده)     */
function readKey(req) {
  const h = req && req.headers && req.headers['x-admin-key'];
  if (h) return String(h);
  try { return new URL(req.url, 'http://x').searchParams.get('key'); } catch (e) { return null; }
}
// مقایسهٔ ثابت‌زمان تا کلید حرف‌به‌حرف حدس زده نشود
function sameSecret(got, want) {
  if (typeof got !== 'string' || typeof want !== 'string') return false;
  const a = Buffer.from(got), b = Buffer.from(want);
  if (a.length !== b.length) return false;
  try { return crypto.timingSafeEqual(a, b); } catch (e) { return false; }
}

/* ---------- قفل شدن پس از چند تلاش ناموفق ----------
 * کلید مدیریت طولانی است و عملاً حدس‌زدنی نیست، ولی این قفل جلوی
 * تلاش‌های خودکار را می‌گیرد و در دفتر ثبت هم رد می‌گذارد. */
const FAILS = new Map();                       // ip → {n, t, until}
const FAIL_MAX    = 10;                        // بیشتر از این → قفل
const FAIL_WINDOW = 15 * 60 * 1000;
const FAIL_LOCK   = 15 * 60 * 1000;
function isLocked(ip) {
  const f = FAILS.get(ip);
  return !!(f && f.until && Date.now() < f.until);
}
function noteFail(req) {
  const ip = clientIp(req), now = Date.now();
  let f = FAILS.get(ip);
  if (!f || now - f.t > FAIL_WINDOW) f = { n: 0, t: now, until: 0 };
  f.n++; f.t = now;
  if (f.n >= FAIL_MAX) {
    f.until = now + FAIL_LOCK;
    f.n = 0;
    audit(req, 'auth:locked', ip, 'پس از ' + FAIL_MAX + ' تلاش ناموفق');
    console.error('قفل موقت برای IP ' + ip + ' پس از تلاش‌های ناموفق');
    saveDB();
  }
  FAILS.set(ip, f);
}
function noteOk(ip) { FAILS.delete(ip); }
setInterval(() => {
  const now = Date.now();
  for (const [ip, f] of FAILS) if (now - f.t > FAIL_WINDOW && !isLocked(ip)) FAILS.delete(ip);
}, FAIL_WINDOW);

/* ---------- فهرست IP مجاز (اختیاری) ----------
 * اگر متغیر ADMIN_IPS تنظیم شود، فقط از همان آدرس‌ها می‌توان مدیریت کرد. */
const ADMIN_IPS = String(process.env.ADMIN_IPS || '').split(',').map(x => x.trim()).filter(Boolean);
function ipAllowed(ip) { return ADMIN_IPS.length === 0 || ADMIN_IPS.indexOf(ip) >= 0; }

/* ---------- نشست مدیریت (توکن کوتاه‌عمر) ----------
 * فقط در حافظه نگه داشته می‌شود؛ با ری‌استارت سرور همه باطل می‌شوند.
 * مزیت: کلید اصلی فقط یک‌بار در هر نشست فرستاده می‌شود، نه در هر درخواست. */
const TOKENS = new Map();                      // token → {ip, exp}
const TOKEN_TTL = 8 * 3600 * 1000;
function newToken(ip) {
  const t = crypto.randomBytes(32).toString('base64url');
  TOKENS.set(t, { ip, exp: Date.now() + TOKEN_TTL });
  return t;
}
function tokenOk(req) {
  const t = req.headers['x-admin-token'];
  if (!t) return false;
  const rec = TOKENS.get(String(t));
  if (!rec) return false;
  if (Date.now() > rec.exp) { TOKENS.delete(String(t)); return false; }
  if (rec.ip !== clientIp(req)) return false;   // توکن به همان IP بسته است
  return true;
}
setInterval(() => {
  const now = Date.now();
  for (const [t, r] of TOKENS) if (now > r.exp) TOKENS.delete(t);
}, 600000);

function keyOk(req) {
  const ip = clientIp(req);
  if (!ipAllowed(ip) || isLocked(ip)) return false;
  if (tokenOk(req)) return true;
  const got = readKey(req);
  if (got == null) return false;                // اصلاً کلیدی نفرستاده — تلاش حساب نمی‌شود
  if (sameSecret(got, ADMIN_KEY)) { noteOk(ip); return true; }
  noteFail(req);
  return false;
}
// getKey فقط برای سازگاری با کدهای قدیمی این فایل
function getKey(url) {
  try { return new URL(url, 'http://x').searchParams.get('key'); } catch (e) { return null; }
}

/* ---------- محدودیت نرخ درخواست ---------- */
const RATE = new Map();
function clientIp(req) {
  const f = req.headers['x-forwarded-for'];
  if (f) return String(f).split(',')[0].trim();
  return (req.socket && req.socket.remoteAddress) || '?';
}
function rateLimited(req) {
  const ip = clientIp(req), now = Date.now();
  let r = RATE.get(ip);
  if (!r || now - r.t > 60000) { r = { n: 0, t: now }; RATE.set(ip, r); }
  r.n++;
  return r.n > RATE_PER_MIN;
}
setInterval(() => {                       // پاک‌سازی شمارنده‌های قدیمی
  const now = Date.now();
  for (const [ip, r] of RATE) if (now - r.t > 120000) RATE.delete(ip);
}, 120000);

/* ---------- اعتبارسنجی ورودی ---------- */
const ID_RE = /^\d{1,3}-\d{4,12}$/;                   // مثل 11-123456

/* ---------- کلید شخصی هر حساب ----------
 * بازی هنگام ساخت حساب یک کلید تصادفی می‌سازد و در هر نوشتن می‌فرستد.
 * سرور بار اول آن را به همان شناسه گره می‌زند (TOFU) و از آن به بعد
 * نوشتن روی آن حساب فقط با همان کلید ممکن است.
 * سازگاری با نسخه‌های قدیمی: حسابی که هنوز کلید ندارد مثل قبل کار می‌کند؛
 * به‌محض اینکه کاربر نسخهٔ تازه را نصب کند، حسابش قفل می‌شود. */
function userKeyOf(req) {
  const h = req && req.headers && req.headers['x-user-key'];
  if (!h) return null;
  const v = String(h).slice(0, 64);
  return /^[A-Za-z0-9_-]{16,64}$/.test(v) ? v : null;
}
/** true = اجازهٔ نوشتن روی این حساب هست */
function ownsAccount(req, id) {
  DB.secrets = DB.secrets || {};
  const bound = DB.secrets[id];
  const got = userKeyOf(req);
  if (!bound) {                       // هنوز قفل نشده
    if (got) { DB.secrets[id] = got; saveDB(); }   // اولین کلید، مالک می‌شود
    return true;
  }
  return sameSecret(got || '', bound);
}
const isId  = s => typeof s === 'string' && ID_RE.test(s);
const isName = s => typeof s === 'string' && s.length >= 1 && s.length <= 32 && !/[\x00-\x1f\x7f]/.test(s);
let dataTooBig = false;
setInterval(() => {
  try { dataTooBig = fs.statSync(DATA_FILE).size > MAX_DATA_MB * 1048576; } catch (e) {}
}, 60000);
// آیا اجازهٔ ساختن کلید تازه هست؟ (به‌روزرسانی کلید موجود همیشه مجاز است)
function canCreate(bucket, key) {
  if (bucket[key] !== undefined) return true;
  if (dataTooBig) return false;
  return Object.keys(bucket).length < MAX_USERS;
}
const clampInt = (v, max) => Math.max(0, Math.min(max, Math.floor(Number(v) || 0)));

/* ---------- دفتر ثبت کارهای مدیریتی ---------- */
function audit(req, action, target, detail) {
  DB.audit = DB.audit || [];
  DB.audit.push({ ts: Date.now(), ip: clientIp(req), action, target: target || '', detail: detail == null ? '' : detail });
  if (DB.audit.length > 500) DB.audit = DB.audit.slice(-500);
}

/* ---------- لیگ هفتگی ---------- */
const WEEK_MS    = 7 * 86400000;
const WEEK_EPOCH = Date.UTC(2024, 0, 1);              // یک دوشنبه
const weekOf = t => Math.floor((t - WEEK_EPOCH) / WEEK_MS);
const weekEnd = w => WEEK_EPOCH + (w + 1) * WEEK_MS;
const LEAGUE_REWARD = [3000, 2000, 1200, 800, 600, 500, 400, 300, 200, 150];
// پایان هفته: جایزهٔ ده نفر برتر ثبت می‌شود و امتیاز هفتگی همه صفر می‌شود
function rollWeek() {
  const w = weekOf(Date.now());
  DB.weekly = DB.weekly || { week: w, top: [] };
  if (DB.weekly.week === w) return;
  const prev = DB.weekly.week;
  const rows = Object.values(DB.leaderboard)
    .filter(x => x && x.u && x.w === prev && Number(x.wt) > 0)
    .sort((x, y) => (y.wt || 0) - (x.wt || 0))
    .slice(0, 10);
  rows.forEach((x, i) => {
    if (!isId(x.id)) return;
    DB.control[x.id] = DB.control[x.id] || {};
    DB.control[x.id].league = { rank: i + 1, coins: LEAGUE_REWARD[i], week: prev, ts: Date.now() };
  });
  DB.weekly = {
    week: w, endedAt: Date.now(),
    top: rows.map((x, i) => ({ rank: i + 1, u: x.u, n: x.n, wt: x.wt, coins: LEAGUE_REWARD[i] }))
  };
  for (const k of Object.keys(DB.leaderboard)) {
    const x = DB.leaderboard[k];
    if (x) { x.wt = 0; x.w = w; }
  }
  saveDB();
  console.log('هفتهٔ ' + prev + ' بسته شد؛ ' + rows.length + ' نفر جایزه گرفتند');
}
// هیچ خطای پیش‌بینی‌نشده‌ای نباید سرور را از کار بیندازد
process.on('uncaughtException',  e => console.error('uncaughtException:', e && e.message));
process.on('unhandledRejection', e => console.error('unhandledRejection:', e && e.message));

/* ---------- سرور ---------- */
const server = http.createServer(async (req, res) => {
 try {
  if (req.method === 'OPTIONS') return sendJSON(res, 200, null);
  if (rateLimited(req)) return sendJSON(res, 429, { error: 'too many requests' });

  const parts  = parsePath(req.url);
  const method = req.method;
  const admin  = keyOk(req);

  // بررسی سلامت سرور
  if (parts.length === 0 || parts[0] === 'health') {
    // feat: پنل از روی این می‌فهمد سرور چه قابلیت‌هایی دارد
    return sendJSON(res, 200, { ok: true, name: 'pasur11-server', time: Date.now(),
      feat: ['auth', 'pay', 'tickets', 'bulk', 'audit', 'appupdate', 'league'] });
  }

  const [root, a, b] = parts;

  /* ===== ۱) اتصال بازی دو نفره ===== */
  if (root === 'sessions') {
    if (method === 'PUT' && a && !b) {                 // میزبان: ثبت پیشنهاد اتصال
      if (!/^\d{4,10}$/.test(a)) return sendJSON(res, 400, { error: 'bad code' });
      if (!canCreate(DB.sessions, a)) return sendJSON(res, 507, { error: 'storage full' });
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

  /* ===== ۲) جدول رتبه‌بندی + لیگ هفتگی ===== */
  if (root === 'leaderboard') {
    rollWeek();
    if (method === 'PUT' && a) {
      if (!isName(a)) return sendJSON(res, 400, { error: 'bad name' });
      if (!canCreate(DB.leaderboard, a)) return sendJSON(res, 507, { error: 'storage full' });
      const body = await readBody(req) || {};
      const w = weekOf(Date.now());
      // مقادیر غیرممکن پذیرفته نمی‌شوند (جلوگیری از دستکاری جدول)
      DB.leaderboard[a] = {
        u:  String(body.u || a).slice(0, 32),
        n:  String(body.n || '').slice(0, 24),
        id: isId(body.id) ? body.id : (DB.leaderboard[a] || {}).id,
        t:  clampInt(body.t,  MAX_TROPHIES),
        l:  clampInt(body.l,  MAX_LEVEL) || 1,
        wt: clampInt(body.wt, MAX_TROPHIES),
        w:  w,
        v:  !!body.v,
        ts: Date.now()
      };
      saveDB(); return sendJSON(res, 200, DB.leaderboard[a]);
    }
    if (method === 'GET' && a === '_week')      // اطلاعات لیگ هفتگی
      return sendJSON(res, 200, {
        week: DB.weekly.week, endsAt: weekEnd(DB.weekly.week),
        lastTop: DB.weekly.top || [], reward: LEAGUE_REWARD
      });
    if (method === 'GET' && !a) return sendJSON(res, 200, DB.leaderboard);
    if (method === 'GET' && a)  return sendJSON(res, 200, DB.leaderboard[a] || null);
    // حذف رکورد قدیمی هنگام تغییر نام‌کاربری (جلوگیری از اکانت تکراری)
    if (method === 'DELETE' && a) { delete DB.leaderboard[a]; saveDB(); return sendJSON(res, 200, null); }
  }

  /* ===== ۳) یکتایی نام‌کاربری ===== */
  if (root === 'usernames') {
    if (method === 'GET' && a) return sendJSON(res, 200, DB.usernames[a] || null);
    if (method === 'PUT' && a) {
      if (!isName(a)) return sendJSON(res, 400, { error: 'bad name' });
      if (!canCreate(DB.usernames, a)) return sendJSON(res, 507, { error: 'storage full' });
      const body = await readBody(req);
      DB.usernames[a] = typeof body === 'string' ? body.slice(0, 64) : body;
      saveDB(); return sendJSON(res, 200, body);
    }
    if (method === 'DELETE' && a) { delete DB.usernames[a]; saveDB(); return sendJSON(res, 200, null); }
  }

  /* ===== ۴) کاربران و دستورهای مدیریتی ===== */
  if (root === 'users') {
    if (method === 'PUT' && a) {
      if (!isId(a)) return sendJSON(res, 400, { error: 'bad id' });
      if (!admin && !ownsAccount(req, a)) return sendJSON(res, 403, { error: 'not your account' });
      if (!canCreate(DB.users, a)) return sendJSON(res, 507, { error: 'storage full' });
      const body = await readBody(req) || {};
      const prev = DB.users[a];
      // «first» = نخستین باری که این کاربر دیده شده (برای نمودار کاربران تازه)
      DB.users[a] = {
        name:     String(body.name || '').slice(0, 24),
        user:     String(body.user || '').slice(0, 32),
        level:    clampInt(body.level, MAX_LEVEL) || 1,
        coins:    clampInt(body.coins, 1e9),
        trophies: clampInt(body.trophies, MAX_TROPHIES),
        vip:      !!body.vip,
        first: (prev && prev.first) || Date.now(),
        ts: Date.now()
      };
      saveDB(); return sendJSON(res, 200, DB.users[a]);
    }
    if (method === 'GET' && a)  return sendJSON(res, 200, DB.users[a] || null);
    // حذف کامل اکانت (فقط با کلید مدیریت)
    if (method === 'DELETE' && a) {
      if (!admin) return sendJSON(res, 403, { error: 'forbidden' });
      const u = DB.users[a];
      delete DB.users[a];
      if (DB.friendreq) delete DB.friendreq[a];
      if (u && u.user) { delete DB.leaderboard[u.user]; delete DB.usernames[u.user]; }
      // نشانهٔ حذف باقی می‌ماند تا بازی روی گوشی هم داده‌های محلی را پاک کند
      DB.control[a] = { deleted: true, ts: Date.now() };
      audit(req, 'user:delete', a, (u && u.name) || '');
      saveDB(); return sendJSON(res, 200, { deleted: true });
    }
    if (method === 'GET' && !a) {
      // فهرست کامل کاربران فقط با کلید مدیریت
      if (!admin) return sendJSON(res, 403, { error: 'forbidden' });
      return sendJSON(res, 200, DB.users);
    }
  }

  /* ===== ۵) درخواست‌های دوستی: /friendreq/<گیرنده>/<فرستنده> ===== */
  if (root === 'friendreq') {
    DB.friendreq = DB.friendreq || {};
    if (method === 'GET' && a && !b) return sendJSON(res, 200, DB.friendreq[a] || null);
    if (method === 'PUT' && a && b) {
      if (!isId(a) || !isId(b)) return sendJSON(res, 400, { error: 'bad id' });
      if (!canCreate(DB.friendreq, a)) return sendJSON(res, 507, { error: 'storage full' });
      const body = await readBody(req);
      DB.friendreq[a] = DB.friendreq[a] || {};
      // سقف ۵۰ درخواست برای هر کاربر (جلوگیری از اسپم)
      if (Object.keys(DB.friendreq[a]).length >= 50 && !DB.friendreq[a][b])
        return sendJSON(res, 429, { error: 'too many requests' });
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
      if (!admin) return sendJSON(res, 403, { error: 'forbidden' });
      return sendJSON(res, 200, DB.broadcastLog || []);
    }
    if (method === 'GET') return sendJSON(res, 200, DB.broadcast || null);
    if (method === 'PUT') {
      if (!admin) return sendJSON(res, 403, { error: 'forbidden' });
      const body = await readBody(req);
      DB.broadcast = body ? Object.assign({}, body, { id: Date.now() }) : null;
      if (DB.broadcast) {                            // نگهداری ۲۰ اعلان اخیر
        DB.broadcastLog = (DB.broadcastLog || []).concat([DB.broadcast]).slice(-20);
      }
      audit(req, 'broadcast', '', (body && body.title) || '');
      saveDB(); return sendJSON(res, 200, DB.broadcast);
    }
    if (method === 'DELETE') {
      if (!admin) return sendJSON(res, 403, { error: 'forbidden' });
      DB.broadcast = null; audit(req, 'broadcast:clear', '', ''); saveDB(); return sendJSON(res, 200, null);
    }
  }

  /* ===== ۷) پشتیبان‌گیری حساب با ایمیل ===== */
  if (root === 'backup') {
    DB.backup = DB.backup || {};
    if (method === 'GET' && a) {
      if (!admin && !ownsAccount(req, a)) return sendJSON(res, 403, { error: 'not your account' });
      return sendJSON(res, 200, DB.backup[a.toLowerCase()] || null);
    }
    if (method === 'PUT' && a) {
      if (!admin && !ownsAccount(req, a)) return sendJSON(res, 403, { error: 'not your account' });
      const body = await readBody(req);
      DB.backup[a.toLowerCase()] = Object.assign({}, body, { ts: Date.now() });
      saveDB(); return sendJSON(res, 200, { ok: true });
    }
  }

  if (root === 'control') {
    // فهرست کامل دستورها، یکجا (پنل با یک درخواست همه را می‌گیرد)
    if (method === 'GET' && !a) {
      if (!admin) return sendJSON(res, 403, { error: 'forbidden' });
      return sendJSON(res, 200, DB.control);
    }
    if (method === 'GET' && a && !b) {
      if (!admin && !ownsAccount(req, a)) return sendJSON(res, 403, { error: 'not your account' });
      return sendJSON(res, 200, DB.control[a] || null);
    }
    // پاک‌کردن همهٔ دستورهای در انتظارِ یک کاربر
    if (method === 'DELETE' && a && !b) {
      if (!admin) return sendJSON(res, 403, { error: 'forbidden' });
      const c = DB.control[a];
      if (c) ['coinGrant','vipGrant','msg','scoreGrant','setProgress','league'].forEach(k => delete c[k]);
      audit(req, 'control:clear', a, '');
      saveDB(); return sendJSON(res, 200, { cleared: true });
    }
    // نوشتن دستور مدیریتی: از سمت بازی فقط صفرکردن مجاز است؛ بقیه کلید می‌خواهد
    if (method === 'PUT' && a && b) {
      const body = await readBody(req);
      const clearing = (body === 0 || body === false || body === '0' || body === 'false');
      if (!clearing && !admin) return sendJSON(res, 403, { error: 'forbidden' });
      // پاک‌کردن دستور فقط از سمت خودِ همان حساب
      if (clearing && !admin && !ownsAccount(req, a))
        return sendJSON(res, 403, { error: 'not your account' });
      if (!clearing && !canCreate(DB.control, a)) return sendJSON(res, 507, { error: 'storage full' });
      DB.control[a] = DB.control[a] || {};
      DB.control[a][b] = body;
      if (!clearing) audit(req, 'control:' + b, a, typeof body === 'object' ? JSON.stringify(body).slice(0, 120) : body);
      saveDB(); return sendJSON(res, 200, body);
    }
  }

  /* ===== ۸) آمار کلی برای پنل مدیریت ===== */
  if (root === 'stats' && method === 'GET') {
    if (!admin) return sendJSON(res, 403, { error: 'forbidden' });
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
    // وضعیت پشتیبان روزانه
    let backupLast = null, backupCount = 0;
    try {
      const dir = path.join(path.dirname(DATA_FILE), 'backups');
      const fl = fs.readdirSync(dir).filter(f => /^data-.*\.gz$/.test(f));
      backupCount = fl.length;
      fl.forEach(f => {
        const m = fs.statSync(path.join(dir, f)).mtimeMs;
        if (!backupLast || m > backupLast) backupLast = m;
      });
    } catch (e) {}
    rollWeek();
    return sendJSON(res, 200, {
      appUpdate: DB.appUpdate || null,
      security: { ipLock: ADMIN_IPS.length > 0, sessions: TOKENS.size, locked: [...FAILS.values()].filter(f => f.until > Date.now()).length },
      tickets: Object.keys(DB.tickets || {}).length,
      ticketsNew: Object.values(DB.tickets || {}).filter(t => t && t.status === 'new').length,
      metrics: DB.metrics || {},
      backupLast, backupCount,
      week: DB.weekly.week, weekEndsAt: weekEnd(DB.weekly.week), lastTop: DB.weekly.top || [],
      canUndo: !!(DB.lastBulk && DB.lastBulk.prev),
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

  /* ===== ۸الف) تیکت پشتیبانی =====
     بازیکن مستقیم از داخل بازی شکایت/پیام می‌فرستد؛ نیازی به ایمیل نیست. */
  /* شمارهٔ کارت را در پاسخ‌های عمومی می‌پوشاند: 6037-99**-****-0250
     نسخهٔ کامل فقط از نقطه‌های مدیریتی (با کلید) دیده می‌شود. */
  function maskPay(text) {
    return String(text == null ? '' : text).replace(
      /\b(\d{4})[- ]?(\d{4})[- ]?(\d{4})[- ]?(\d{4})\b/g,
      (m, a1, a2, a3, a4) => a1 + '-' + a2[0] + a2[1] + '**-****-' + a4);
  }
  if (root === 'tickets') {
    DB.tickets = DB.tickets || {};
    // ثبت تیکت تازه از سمت بازی (بدون کلید مدیریت)
    if (method === 'PUT' && a && !b) {
      if (!isId(a)) return sendJSON(res, 400, { error: 'bad id' });
      if (!ownsAccount(req, a)) return sendJSON(res, 403, { error: 'not your account' });
      if (dataTooBig) return sendJSON(res, 507, { error: 'storage full' });
      const body = await readBody(req) || {};
      const text = String(body.text || '').slice(0, 1500).trim();
      if (!text) return sendJSON(res, 400, { error: 'empty' });
      // ضد اسپم: حداکثر ۵ تیکت باز از هر کاربر، و یکی در هر ۲ دقیقه
      const mine = Object.values(DB.tickets).filter(t => t && t.uid === a);
      const open = mine.filter(t => t.status !== 'done');
      if (open.length >= 5) return sendJSON(res, 429, { error: 'too many open tickets' });
      const last = mine.reduce((m, t) => Math.max(m, t.ts || 0), 0);
      if (Date.now() - last < 120000) return sendJSON(res, 429, { error: 'wait' });
      if (Object.keys(DB.tickets).length >= 20000) return sendJSON(res, 507, { error: 'full' });

      const u = DB.users[a] || {};
      const id = String(Date.now()).slice(-8) + Math.floor(Math.random() * 90 + 10);
      DB.tickets[id] = {
        id, uid: a, ts: Date.now(), status: 'new',
        kind: String(body.kind || 'other').slice(0, 24),
        text,
        // اطلاعات حساب، خودکار همراه تیکت می‌آید تا پشتیبانی سریع‌تر کمک کند
        name: String(body.name || u.name || '').slice(0, 24),
        user: String(body.user || u.user || '').slice(0, 32),
        level: clampInt(body.level, MAX_LEVEL),
        coins: clampInt(body.coins, 1e9),
        trophies: clampInt(body.trophies, MAX_TROPHIES),
        vip: !!body.vip,
        games: clampInt(body.games, 1e7),
        wins: clampInt(body.wins, 1e7),
        ver: String(body.ver || '').slice(0, 16),
        dev: String(body.dev || '').slice(0, 120),
        // فقط برای تیکت «مشکل خرید»: کد پیگیری و شمارهٔ کارت (هر دو فقط رقم)
        ref:  String(body.ref  || '').replace(/\D/g, '').slice(0, 32),
        card: String(body.card || '').replace(/\D/g, '').slice(0, 16),
        banned: !!((DB.control[a] || {}).banned),
        msgs: [{ who: 'user', text, ts: Date.now() }]
      };
      saveDB();
      return sendJSON(res, 200, { ok: true, id });
    }
    // پاسخ کاربر روی تیکت باز (گفتگوی دوطرفه)
    if (method === 'PUT' && a && b && b !== 'reply' && isId(a)) {
      if (!ownsAccount(req, a)) return sendJSON(res, 403, { error: 'not your account' });
      const t = DB.tickets[b];
      if (!t || t.uid !== a) return sendJSON(res, 404, { error: 'not found' });
      const body = await readBody(req) || {};
      const text = String(body.text || '').slice(0, 1500).trim();
      if (!text) return sendJSON(res, 400, { error: 'empty' });
      t.msgs = t.msgs || [{ who: 'user', text: t.text, ts: t.ts }];
      if (t.msgs.length >= 30) return sendJSON(res, 429, { error: 'too many messages' });
      // اگر آخرین پیام از خودِ کاربر باشد یعنی دارد پشت‌سرهم می‌نویسد → کمی صبر
      // ولی اگر پشتیبانی جواب داده، بتواند فوراً پاسخ بدهد
      const last = t.msgs[t.msgs.length - 1];
      if (last && last.who === 'user' && Date.now() - (last.ts || 0) < 20000)
        return sendJSON(res, 429, { error: 'wait' });
      t.msgs.push({ who: 'user', text, ts: Date.now() });
      t.status = 'new';                       // دوباره نیاز به رسیدگی دارد
      t.lastUser = Date.now();
      saveDB();
      return sendJSON(res, 200, { ok: true });
    }
    // پیگیری تیکت‌های خودِ کاربر (فقط تیکت‌های همان شناسه)
    if (method === 'GET' && a === 'mine' && b) {
      if (!isId(b)) return sendJSON(res, 400, { error: 'bad id' });
      if (!admin && !ownsAccount(req, b)) return sendJSON(res, 403, { error: 'not your account' });
      const mine = Object.values(DB.tickets).filter(t => t && t.uid === b)
        .sort((x, y) => y.ts - x.ts).slice(0, 20)
        .map(t => ({ id: t.id, ts: t.ts, kind: t.kind, text: maskPay(t.text),
                     status: t.status, reply: t.reply || '', replyTs: t.replyTs || 0,
                     msgs: (t.msgs || [{ who: 'user', text: t.text, ts: t.ts }])
                             .map(m => Object.assign({}, m, { text: maskPay(m.text) })) }));
      return sendJSON(res, 200, mine);
    }
    // فهرست کامل برای پنل
    if (method === 'GET' && !a) {
      if (!admin) return sendJSON(res, 403, { error: 'forbidden' });
      return sendJSON(res, 200, DB.tickets);
    }
    // پاسخ/تغییر وضعیت از پنل
    if (method === 'PUT' && a && b === 'reply') {
      if (!admin) return sendJSON(res, 403, { error: 'forbidden' });
      const t = DB.tickets[a];
      if (!t) return sendJSON(res, 404, { error: 'not found' });
      const body = await readBody(req) || {};
      const reply = String(body.reply || '').slice(0, 1500).trim();
      const gift  = clampInt(body.coins, 1000000);
      if (reply) {
        t.reply = reply; t.replyTs = Date.now();
        t.status = body.keepOpen ? 'read' : 'done';
        t.msgs = t.msgs || [{ who: 'user', text: t.text, ts: t.ts }];
        t.msgs.push({ who: 'admin', text: reply, ts: Date.now(), coins: gift || 0 });
        // پاسخ در صندوق پستی بازیکن نشان داده می‌شود
        DB.control[t.uid] = DB.control[t.uid] || {};
        DB.control[t.uid].msg = reply;
      }
      // هدیهٔ سکه همراه پاسخ (برای جبران)
      if (gift > 0) {
        DB.control[t.uid] = DB.control[t.uid] || {};
        DB.control[t.uid].coinGrant = (Number(DB.control[t.uid].coinGrant) || 0) + gift;
        t.gift = (Number(t.gift) || 0) + gift;
      }
      if (body.status) t.status = String(body.status).slice(0, 10);
      audit(req, 'ticket:reply', t.uid, reply.slice(0, 80) + (gift ? (' +' + gift + ' سکه') : ''));
      saveDB(); return sendJSON(res, 200, { ok: true });
    }
    if (method === 'DELETE' && a) {
      if (!admin) return sendJSON(res, 403, { error: 'forbidden' });
      delete DB.tickets[a];
      audit(req, 'ticket:delete', a, '');
      saveDB(); return sendJSON(res, 200, { ok: true });
    }
  }

  /* ===== ۸ه) ورود مدیریت و گرفتن توکن نشست ===== */
  if (root === 'auth') {
    const ip = clientIp(req);
    if (method === 'POST' || method === 'PUT') {
      if (!ipAllowed(ip)) return sendJSON(res, 403, { error: 'ip not allowed' });
      if (isLocked(ip)) {
        const f = FAILS.get(ip);
        return sendJSON(res, 429, { error: 'locked', retryIn: Math.ceil((f.until - Date.now()) / 1000) });
      }
      const body = await readBody(req) || {};
      if (!sameSecret(String(body.key || ''), ADMIN_KEY)) {
        noteFail(req);
        const f = FAILS.get(ip) || { n: 0 };
        return sendJSON(res, 403, { error: 'bad key', left: Math.max(0, FAIL_MAX - f.n) });
      }
      noteOk(ip);
      const token = newToken(ip);
      audit(req, 'auth:login', ip, '');
      saveDB();
      return sendJSON(res, 200, { token, ttl: TOKEN_TTL });
    }
    // خروج: باطل کردن توکن
    if (method === 'DELETE') {
      const t = req.headers['x-admin-token'];
      if (t) TOKENS.delete(String(t));
      return sendJSON(res, 200, { ok: true });
    }
  }

  /* ===== ۸د) اجبار به‌روزرسانی نسخهٔ بازی ===== */
  if (root === 'appupdate') {
    if (method === 'GET') return sendJSON(res, 200, DB.appUpdate || null);
    if (method === 'PUT') {
      if (!admin) return sendJSON(res, 403, { error: 'forbidden' });
      const body = await readBody(req);
      DB.appUpdate = body ? {
        min:    clampInt(body.min, 100000),      // پایین‌تر از این = اجباری
        latest: clampInt(body.latest, 100000),   // آخرین نسخه (پیشنهاد اختیاری)
        title:  String(body.title || '').slice(0, 60),
        text:   String(body.text  || '').slice(0, 400),
        url:    String(body.url   || '').slice(0, 200),
        ts: Date.now()
      } : null;
      audit(req, 'appupdate', '', DB.appUpdate ? ('min=' + DB.appUpdate.min) : 'حذف');
      saveDB(); return sendJSON(res, 200, DB.appUpdate);
    }
  }

  /* ===== ۸ب) شمارندهٔ قیف (بازی هر مرحله را یک‌بار می‌فرستد) ===== */
  if (root === 'metric' && (method === 'PUT' || method === 'POST') && a) {
    const OK = ['install', 'game1', 'game3', 'game10', 'shop', 'buy', 'profile', 'mp'];
    if (OK.indexOf(a) < 0) return sendJSON(res, 400, { error: 'bad metric' });
    DB.metrics = DB.metrics || {};
    DB.metrics[a] = (Number(DB.metrics[a]) || 0) + 1;
    saveDB(); return sendJSON(res, 200, { ok: true });
  }

  /* ===== ۸ج) دفتر ثبت کارهای مدیریتی ===== */
  if (root === 'audit' && method === 'GET') {
    if (!admin) return sendJSON(res, 403, { error: 'forbidden' });
    return sendJSON(res, 200, (DB.audit || []).slice(-200).reverse());
  }

  /* ===== ۹) فهرست نشست‌های بازی دو نفره (زنده) ===== */
  if (root === 'sessions' && method === 'GET' && !a) {
    if (!admin) return sendJSON(res, 403, { error: 'forbidden' });
    const out = Object.keys(DB.sessions).map(code => {
      const s = DB.sessions[code] || {};
      return { code, ts: s.ts || 0, answered: !!s.answer };
    }).sort((x, y) => y.ts - x.ts);
    return sendJSON(res, 200, out);
  }

  /* ===== ۱۰) عملیات گروهی: یک دستور برای چند کاربر ===== */
  if (root === 'bulk' && method === 'PUT') {
    if (!admin) return sendJSON(res, 403, { error: 'forbidden' });
    const body = await readBody(req) || {};
    const field = String(body.field || '');
    const ALLOWED = ['coinGrant', 'scoreGrant', 'vipGrant', 'msg', 'banned'];
    if (ALLOWED.indexOf(field) < 0) return sendJSON(res, 400, { error: 'bad field' });
    let ids = Array.isArray(body.ids) ? body.ids : [];
    if (!ids.length) return sendJSON(res, 400, { error: 'no ids' });
    if (ids.length > 5000) ids = ids.slice(0, 5000);
    const add = (field === 'coinGrant' || field === 'scoreGrant') && body.mode !== 'set';
    // مقادیر قبلی نگه داشته می‌شوند تا «برگرداندن» ممکن باشد
    const prevMap = {};
    for (const id of ids) if (typeof id === 'string') prevMap[id] = (DB.control[id] || {})[field];
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
    DB.lastBulk = { field, prev: prevMap, ts: Date.now(), count: n };
    audit(req, 'bulk:' + field, n + ' کاربر', body.value);
    saveDB();
    return sendJSON(res, 200, { ok: true, count: n, field });
  }

  /* ===== ۱۰ب) برگرداندن آخرین عملیات گروهی ===== */
  if (root === 'bulk' && method === 'DELETE') {
    if (!admin) return sendJSON(res, 403, { error: 'forbidden' });
    const lb = DB.lastBulk;
    if (!lb || !lb.prev) return sendJSON(res, 404, { error: 'nothing to undo' });
    let n = 0;
    for (const id of Object.keys(lb.prev)) {
      if (!DB.control[id]) continue;
      if (lb.prev[id] === undefined) delete DB.control[id][lb.field];
      else DB.control[id][lb.field] = lb.prev[id];
      n++;
    }
    audit(req, 'bulk:undo', n + ' کاربر', lb.field);
    DB.lastBulk = null; saveDB();
    return sendJSON(res, 200, { ok: true, count: n });
  }

  /* ===== ۱۱) خروجی کامل داده‌ها (پشتیبان) ===== */
  if (root === 'export' && method === 'GET') {
    if (!admin) return sendJSON(res, 403, { error: 'forbidden' });
    return sendJSON(res, 200, DB);
  }

  return sendJSON(res, 404, { error: 'not found' });
 } catch (e) {
  console.error('request error:', e && e.message);
  try { sendJSON(res, 500, { error: 'server error' }); } catch (e2) {}
 }
});
server.on('clientError', (err, socket) => { try { socket.destroy(); } catch (e) {} });

// اگر پورت اشغال باشد باید فوراً بمیریم تا pm2 خبردار شود؛
// وگرنه فرایند زنده می‌ماند ولی هیچ درخواستی را جواب نمی‌دهد
server.on('error', e => {
  console.error('راه‌اندازی سرور ناموفق بود:', e && e.message);
  process.exit(1);
});
server.listen(PORT, () => console.log('سرور پاسور ۱۱ روی پورت ' + PORT + ' اجرا شد'));
