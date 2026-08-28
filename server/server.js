/* ================================================================
   سرور بازی «پاسور ۱۱»
   ----------------------------------------------------------------
   روی سرور مجازی/ابری (مثلاً پارس‌پک) با Node.js نسخهٔ ۱۸ به بالا اجرا می‌شود.
   هیچ کتابخانهٔ بیرونی لازم ندارد؛ فقط:   node server.js

   کارهایی که انجام می‌دهد:
     ۱. کد کوتاه ۷ رقمی بازی دو نفره (تبادل offer/answer وب‌آر‌تی‌سی)
     ۲. جدول رتبه‌بندی جهانی
     ۳. یکتا نگه‌داشتن نام‌کاربری
     ۴. تأیید امضای خرید درون‌برنامه‌ای مایکت و ثبت جایزهٔ هر خرید

   داده‌ها در یک فایل JSON کنار همین برنامه ذخیره می‌شوند (data/db.json).
   ================================================================ */
'use strict';

const http    = require('http');
const https   = require('https');
const fs      = require('fs');
const path    = require('path');
const crypto  = require('crypto');

/* ---------------- خواندن تنظیمات ---------------- */
const ROOT = __dirname;
function readConfig() {
  const file = path.join(ROOT, 'config.json');
  let cfg = {};
  try { cfg = JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch (e) { console.error('[config] خواندن config.json ممکن نشد:', e.message); }

  // متغیرهای محیطی بر فایل تنظیمات اولویت دارند
  return {
    port:            parseInt(process.env.PORT || cfg.port || 8080, 10),
    host:            process.env.HOST || cfg.host || '0.0.0.0',
    name:            cfg.name || 'Pasur11 API',
    allowedOrigins:  (process.env.ALLOWED_ORIGINS || '').trim()
                       ? process.env.ALLOWED_ORIGINS.split(',').map(s => s.trim()).filter(Boolean)
                       : (Array.isArray(cfg.allowedOrigins) ? cfg.allowedOrigins : ['*']),
    myketPublicKey:  (process.env.MYKET_PUBLIC_KEY || cfg.myketPublicKey || '').trim(),
    // در حالت آزمایشی می‌توان بررسی امضا را موقتاً خاموش کرد (فقط برای تست محلی)
    skipSignature:   String(process.env.SKIP_SIGNATURE || cfg.skipSignature || 'false') === 'true',
    sessionTtlMs:    (cfg.sessionTtlMinutes || 10) * 60 * 1000,
    leaderboardMax:  cfg.leaderboardMax || 200,
    tlsCert:         process.env.TLS_CERT || cfg.tlsCert || '',
    tlsKey:          process.env.TLS_KEY  || cfg.tlsKey  || '',
    products:        cfg.products && typeof cfg.products === 'object' ? cfg.products : {}
  };
}
const CFG = readConfig();

/* ---------------- ذخیره‌سازی ساده و امن روی دیسک ----------------
   نوشتن‌ها پشت سر هم (صف) و به‌صورت اتمیک انجام می‌شود تا فایل هیچ‌وقت
   نیمه‌کاره نماند، حتی اگر سرور همان لحظه خاموش شود. */
const DATA_DIR  = path.join(ROOT, 'data');
const DATA_FILE = path.join(DATA_DIR, 'db.json');
const EMPTY_DB  = { sessions: {}, usernames: {}, leaderboard: {}, purchases: {}, players: {} };

function loadDB() {
  try {
    const raw = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    return Object.assign({}, EMPTY_DB, raw);
  } catch (e) {
    return JSON.parse(JSON.stringify(EMPTY_DB));
  }
}
const DB = loadDB();

let writeQueued = false, writing = false;
function saveDB() {
  if (writing) { writeQueued = true; return; }
  writing = true;
  const tmp = DATA_FILE + '.tmp';
  const body = JSON.stringify(DB);
  fs.mkdir(DATA_DIR, { recursive: true }, () => {
    fs.writeFile(tmp, body, err => {
      const done = () => {
        writing = false;
        if (writeQueued) { writeQueued = false; saveDB(); }
      };
      if (err) { console.error('[db] نوشتن ناموفق:', err.message); return done(); }
      fs.rename(tmp, DATA_FILE, err2 => {
        if (err2) console.error('[db] جابه‌جایی فایل ناموفق:', err2.message);
        done();
      });
    });
  });
}

/* ---------------- ابزارها ---------------- */
function nowMs() { return Date.now(); }
function clampInt(v, min, max, dflt) {
  const n = parseInt(v, 10);
  if (!Number.isFinite(n)) return dflt;
  return Math.max(min, Math.min(max, n));
}
function cleanStr(v, max) {
  return String(v == null ? '' : v).replace(/[\u0000-\u001f\u007f]/g, '').slice(0, max || 64).trim();
}
const USERNAME_RE = /^[a-zA-Z0-9_.]{3,20}$/;

/* پاک‌سازی دوره‌ای: نشست‌های منقضی و کد‌های بلااستفاده */
function sweep() {
  const t = nowMs();
  let changed = false;
  for (const code of Object.keys(DB.sessions)) {
    if (t - (DB.sessions[code].ts || 0) > CFG.sessionTtlMs) { delete DB.sessions[code]; changed = true; }
  }
  if (changed) saveDB();
}
setInterval(sweep, 60 * 1000).unref();

/* ---------------- تأیید امضای خرید مایکت ----------------
   مایکت (مثل گوگل‌پلی) دو چیز برمی‌گرداند:
     purchaseData : یک رشتهٔ JSON شامل orderId، productId، purchaseToken و…
     signature    : امضای همان رشته با کلید خصوصی مایکت (base64)
   ما با «کلید عمومی RSA» که در پنل توسعه‌دهندهٔ مایکت داده شده،
   درستی امضا را با الگوریتم SHA1withRSA بررسی می‌کنیم. */
function pemFromBase64(b64) {
  const clean = String(b64 || '').replace(/\s+/g, '');
  if (!clean) return '';
  const lines = clean.match(/.{1,64}/g) || [];
  return '-----BEGIN PUBLIC KEY-----\n' + lines.join('\n') + '\n-----END PUBLIC KEY-----\n';
}
const MYKET_PEM = pemFromBase64(CFG.myketPublicKey);

function verifyMyketSignature(purchaseData, signature) {
  if (CFG.skipSignature) return true;
  if (!MYKET_PEM) { console.error('[iap] کلید عمومی مایکت تنظیم نشده است'); return false; }
  if (!purchaseData || !signature) return false;
  try {
    const v = crypto.createVerify('RSA-SHA1');
    v.update(Buffer.from(String(purchaseData), 'utf8'));
    v.end();
    return v.verify(MYKET_PEM, String(signature).replace(/\s+/g, ''), 'base64');
  } catch (e) {
    console.error('[iap] بررسی امضا با خطا مواجه شد:', e.message);
    return false;
  }
}

/* جایزهٔ هر محصول — دقیقاً مطابق شناسه‌های پنل مایکت.
   با config.json قابل تغییر است بدون دست زدن به کد. */
const DEFAULT_PRODUCTS = {
  'coins_500':          { coins: 500,  tickets: 1,  vipDays: 0,  consumable: true  },
  'coins_1500':         { coins: 1500, tickets: 3,  vipDays: 0,  consumable: true  },
  'coins_4000':         { coins: 4000, tickets: 10, vipDays: 0,  consumable: true  },
  'vip_subscription':   { coins: 0,    tickets: 3,  vipDays: 30, consumable: false },
  'vip_subscription_2': { coins: 0,    tickets: 7,  vipDays: 60, consumable: false },
  'vip_subscription_3': { coins: 0,    tickets: 12, vipDays: 90, consumable: false }
};
const PRODUCTS = Object.assign({}, DEFAULT_PRODUCTS, CFG.products);

/* ---------------- پاسخ‌دهی HTTP ---------------- */
function originAllowed(origin) {
  if (!origin) return '*';
  if (CFG.allowedOrigins.indexOf('*') !== -1) return '*';
  return CFG.allowedOrigins.indexOf(origin) !== -1 ? origin : '';
}
function send(res, status, obj, origin) {
  const body = JSON.stringify(obj == null ? {} : obj);
  const allow = originAllowed(origin);
  const headers = {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff'
  };
  if (allow) {
    headers['Access-Control-Allow-Origin'] = allow;
    headers['Vary'] = 'Origin';
  }
  res.writeHead(status, headers);
  res.end(body);
}
function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', c => {
      size += c.length;
      if (size > (limit || 128 * 1024)) { reject(new Error('too-large')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw) return resolve({});
      try { resolve(JSON.parse(raw)); } catch (e) { reject(new Error('bad-json')); }
    });
    req.on('error', reject);
  });
}

/* محدودکنندهٔ سادهٔ نرخ درخواست تا کسی سرور را زیر فشار نگذارد */
const RATE = new Map();
function rateLimited(ip, max, windowMs) {
  const t = nowMs();
  const w = windowMs || 60000;
  let rec = RATE.get(ip);
  if (!rec || t - rec.start > w) { rec = { start: t, n: 0 }; RATE.set(ip, rec); }
  rec.n++;
  if (RATE.size > 5000) { for (const k of RATE.keys()) { if (t - RATE.get(k).start > w) RATE.delete(k); } }
  return rec.n > (max || 120);
}

/* ---------------- مسیرها ---------------- */
function newShortCode() {
  for (let i = 0; i < 40; i++) {
    const code = String(crypto.randomInt(1000000, 10000000));
    if (!DB.sessions[code]) return code;
  }
  return null;
}

function playerOf(deviceId) {
  if (!DB.players[deviceId]) DB.players[deviceId] = { coins: 0, tickets: 0, vipUntil: 0, orders: [] };
  return DB.players[deviceId];
}

async function route(req, res, url, origin, ip) {
  const p = url.pathname;
  const m = req.method;

  /* --- سلامت سرور --- */
  if (p === '/api/health' && m === 'GET') {
    return send(res, 200, {
      ok: true,
      name: CFG.name,
      time: nowMs(),
      iap: !!MYKET_PEM || CFG.skipSignature
    }, origin);
  }

  /* --- بازی دو نفره: ساخت نشست --- */
  if (p === '/api/mp/session' && m === 'POST') {
    if (rateLimited('mp:' + ip, 30)) return send(res, 429, { error: 'too-many' }, origin);
    const body = await readBody(req);
    if (!body.offer || typeof body.offer !== 'object' || !body.offer.type) {
      return send(res, 400, { error: 'bad-offer' }, origin);
    }
    sweep();
    const code = newShortCode();
    if (!code) return send(res, 503, { error: 'no-code' }, origin);
    DB.sessions[code] = { offer: body.offer, answer: null, name: cleanStr(body.name, 20), ts: nowMs() };
    saveDB();
    return send(res, 201, { ok: true, code: code, expiresInSec: Math.round(CFG.sessionTtlMs / 1000) }, origin);
  }

  const mpMatch = p.match(/^\/api\/mp\/session\/(\d{7})(\/answer)?$/);
  if (mpMatch) {
    const code = mpMatch[1], isAnswer = !!mpMatch[2];
    const sess = DB.sessions[code];

    if (m === 'GET' && !isAnswer) {
      if (!sess) return send(res, 404, { error: 'not-found' }, origin);
      return send(res, 200, { ok: true, offer: sess.offer, name: sess.name || '' }, origin);
    }
    if (m === 'GET' && isAnswer) {
      if (!sess) return send(res, 404, { error: 'not-found' }, origin);
      return send(res, 200, { ok: true, answer: sess.answer || null }, origin);
    }
    if (m === 'POST' && isAnswer) {
      if (!sess) return send(res, 404, { error: 'not-found' }, origin);
      const body = await readBody(req);
      if (!body.answer || typeof body.answer !== 'object' || !body.answer.type) {
        return send(res, 400, { error: 'bad-answer' }, origin);
      }
      sess.answer = body.answer;
      sess.joinerName = cleanStr(body.name, 20);
      sess.ts = nowMs();
      saveDB();
      return send(res, 200, { ok: true }, origin);
    }
    if (m === 'DELETE') {
      if (sess) { delete DB.sessions[code]; saveDB(); }
      return send(res, 200, { ok: true }, origin);
    }
    return send(res, 405, { error: 'method' }, origin);
  }

  /* --- جدول رتبه‌بندی --- */
  if (p === '/api/leaderboard' && m === 'GET') {
    const rows = Object.values(DB.leaderboard)
      .filter(x => x && x.username)
      .sort((a, b) => (b.trophies || 0) - (a.trophies || 0) || (b.level || 0) - (a.level || 0))
      .slice(0, 50)
      .map(x => ({ username: x.username, name: x.name, trophies: x.trophies, level: x.level }));
    return send(res, 200, { ok: true, rows: rows }, origin);
  }
  if (p === '/api/leaderboard' && m === 'POST') {
    if (rateLimited('lb:' + ip, 60)) return send(res, 429, { error: 'too-many' }, origin);
    const body = await readBody(req);
    const username = cleanStr(body.username, 20).toLowerCase();
    const deviceId = cleanStr(body.deviceId, 64);
    if (!USERNAME_RE.test(username)) return send(res, 400, { error: 'bad-username' }, origin);
    // فقط صاحب نام‌کاربری می‌تواند رکورد آن را به‌روز کند
    const owner = DB.usernames[username];
    if (owner && deviceId && owner !== deviceId) return send(res, 403, { error: 'not-owner' }, origin);
    DB.leaderboard[username] = {
      username: username,
      name: cleanStr(body.name, 20) || username,
      trophies: clampInt(body.trophies, 0, 1000000, 0),
      level: clampInt(body.level, 1, 10000, 1),
      ts: nowMs()
    };
    // نگه‌داشتن اندازهٔ جدول در حد معقول
    const keys = Object.keys(DB.leaderboard);
    if (keys.length > CFG.leaderboardMax) {
      keys.map(k => DB.leaderboard[k])
          .sort((a, b) => (a.trophies || 0) - (b.trophies || 0))
          .slice(0, keys.length - CFG.leaderboardMax)
          .forEach(x => { delete DB.leaderboard[x.username]; });
    }
    saveDB();
    return send(res, 200, { ok: true }, origin);
  }

  /* --- یکتایی نام‌کاربری --- */
  const unMatch = p.match(/^\/api\/username\/([^\/]+)$/);
  if (unMatch && m === 'GET') {
    const u = cleanStr(decodeURIComponent(unMatch[1]), 20).toLowerCase();
    if (!USERNAME_RE.test(u)) return send(res, 400, { error: 'bad-username' }, origin);
    return send(res, 200, { ok: true, available: !DB.usernames[u] }, origin);
  }
  if (p === '/api/username/claim' && m === 'POST') {
    if (rateLimited('un:' + ip, 40)) return send(res, 429, { error: 'too-many' }, origin);
    const body = await readBody(req);
    const u = cleanStr(body.username, 20).toLowerCase();
    const dev = cleanStr(body.deviceId, 64);
    const prev = cleanStr(body.previous, 20).toLowerCase();
    if (!USERNAME_RE.test(u)) {
      return send(res, 400, { ok: false, error: 'bad-username', message: 'نام‌کاربری باید ۳ تا ۲۰ حرف انگلیسی، عدد، نقطه یا زیرخط باشد' }, origin);
    }
    if (!dev) return send(res, 400, { ok: false, error: 'bad-device' }, origin);
    const owner = DB.usernames[u];
    if (owner && owner !== dev) {
      return send(res, 409, { ok: false, error: 'taken', message: 'این نام‌کاربری قبلاً گرفته شده؛ یکی دیگر انتخاب کن' }, origin);
    }
    DB.usernames[u] = dev;
    if (prev && prev !== u && DB.usernames[prev] === dev) {
      delete DB.usernames[prev];
      delete DB.leaderboard[prev];
    }
    saveDB();
    return send(res, 200, { ok: true }, origin);
  }

  /* --- تأیید خرید درون‌برنامه‌ای مایکت --- */
  if (p === '/api/iap/myket/verify' && m === 'POST') {
    if (rateLimited('iap:' + ip, 40)) return send(res, 429, { error: 'too-many' }, origin);
    const body = await readBody(req);
    const sku = cleanStr(body.sku, 64);
    const purchaseData = String(body.purchaseData || '');
    const signature = String(body.signature || '');
    const deviceId = cleanStr(body.deviceId, 64);

    const product = PRODUCTS[sku];
    if (!product) return send(res, 400, { ok: false, error: 'unknown-sku' }, origin);

    if (!verifyMyketSignature(purchaseData, signature)) {
      return send(res, 403, { ok: false, error: 'bad-signature' }, origin);
    }

    let info = {};
    try { info = JSON.parse(purchaseData); } catch (e) { info = {}; }
    // شناسهٔ محصول داخل رسید باید با چیزی که برنامه ادعا می‌کند یکی باشد
    if (info.productId && info.productId !== sku) {
      return send(res, 403, { ok: false, error: 'sku-mismatch' }, origin);
    }
    // وضعیت خرید: ۰ یعنی خریداری‌شده (مثل گوگل‌پلی)
    if (info.purchaseState !== undefined && Number(info.purchaseState) !== 0) {
      return send(res, 403, { ok: false, error: 'not-purchased' }, origin);
    }

    const orderId = cleanStr(info.orderId || info.purchaseToken || '', 128);
    if (!orderId) return send(res, 400, { ok: false, error: 'no-order-id' }, origin);

    const grant = {
      coins: clampInt(product.coins, 0, 1000000, 0),
      tickets: clampInt(product.tickets, 0, 100000, 0),
      vipDays: clampInt(product.vipDays, 0, 3650, 0)
    };

    // خرید تکراری هرگز دوباره جایزه نمی‌دهد
    if (DB.purchases[orderId]) {
      return send(res, 200, { ok: true, duplicate: true, orderId: orderId, grant: grant }, origin);
    }
    DB.purchases[orderId] = {
      sku: sku, deviceId: deviceId,
      username: cleanStr(body.username, 20).toLowerCase(),
      ts: nowMs(), token: cleanStr(info.purchaseToken || '', 128)
    };

    if (deviceId) {
      const pl = playerOf(deviceId);
      pl.coins += grant.coins;
      pl.tickets += grant.tickets;
      if (grant.vipDays) {
        const base = Math.max(nowMs(), pl.vipUntil || 0);
        pl.vipUntil = base + grant.vipDays * 86400000;
      }
      pl.orders.push(orderId);
      if (pl.orders.length > 500) pl.orders = pl.orders.slice(-500);
    }
    saveDB();
    console.log('[iap] خرید تأییدشده:', sku, orderId, deviceId || '-');
    return send(res, 200, { ok: true, duplicate: false, orderId: orderId, grant: grant }, origin);
  }

  /* --- فهرست خریدهای یک دستگاه (برای بازیابی) --- */
  if (p === '/api/iap/purchases' && m === 'GET') {
    const dev = cleanStr(url.searchParams.get('deviceId'), 64);
    if (!dev) return send(res, 400, { error: 'bad-device' }, origin);
    const pl = DB.players[dev];
    if (!pl) return send(res, 200, { ok: true, coins: 0, tickets: 0, vipUntil: 0, orders: [] }, origin);
    return send(res, 200, { ok: true, coins: pl.coins, tickets: pl.tickets, vipUntil: pl.vipUntil, orders: pl.orders }, origin);
  }

  return send(res, 404, { error: 'not-found' }, origin);
}

/* ---------------- سرور ---------------- */
function handler(req, res) {
  const origin = req.headers.origin || '';
  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim()
             || (req.socket && req.socket.remoteAddress) || 'unknown';

  if (req.method === 'OPTIONS') {
    const allow = originAllowed(origin);
    const h = {
      'Access-Control-Allow-Methods': 'GET,POST,DELETE,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '86400',
      'Content-Length': '0'
    };
    if (allow) { h['Access-Control-Allow-Origin'] = allow; h['Vary'] = 'Origin'; }
    res.writeHead(204, h);
    return res.end();
  }

  let url;
  try { url = new URL(req.url, 'http://' + (req.headers.host || 'localhost')); }
  catch (e) { return send(res, 400, { error: 'bad-url' }, origin); }

  if (rateLimited('all:' + ip, 300)) return send(res, 429, { error: 'too-many' }, origin);

  route(req, res, url, origin, ip).catch(err => {
    const msg = (err && err.message) || 'server-error';
    if (msg === 'bad-json' || msg === 'too-large') return send(res, 400, { error: msg }, origin);
    console.error('[error]', msg);
    send(res, 500, { error: 'server-error' }, origin);
  });
}

let server;
if (CFG.tlsCert && CFG.tlsKey) {
  server = https.createServer({
    cert: fs.readFileSync(CFG.tlsCert),
    key: fs.readFileSync(CFG.tlsKey)
  }, handler);
} else {
  server = http.createServer(handler);
}

server.listen(CFG.port, CFG.host, () => {
  console.log('──────────────────────────────────────────');
  console.log(' ' + CFG.name);
  console.log(' آدرس  : ' + (CFG.tlsCert ? 'https' : 'http') + '://' + CFG.host + ':' + CFG.port);
  console.log(' مایکت : ' + (MYKET_PEM ? 'کلید عمومی بارگذاری شد ✔'
                                       : (CFG.skipSignature ? 'حالت آزمایشی (بدون بررسی امضا) ⚠' : 'کلید تنظیم نشده ✖')));
  console.log(' داده  : ' + DATA_FILE);
  console.log('──────────────────────────────────────────');
});

process.on('SIGTERM', () => { saveDB(); server.close(() => process.exit(0)); });
process.on('SIGINT',  () => { saveDB(); server.close(() => process.exit(0)); });
