# -*- coding: utf-8 -*-
"""
ربات مدیریت کاربران پاسور ۱۱ — نسخهٔ سرور لیارا (بدون Firebase)
---------------------------------------------------------------
با سرور ایرانی (server/server.js روی لیارا) کار می‌کند.

نصب:
    pip install python-telegram-bot requests
اجرا:
    python bot_liara.py

فقط چهار مقدار زیر را پر کن.
"""

import requests
from telegram import Update
from telegram.ext import Application, CommandHandler, ContextTypes

# ===================== تنظیمات (این چهار مورد را پر کن) =====================
BOT_TOKEN  = "PUT_YOUR_TELEGRAM_BOT_TOKEN"      # از @BotFather
ADMIN_IDS  = [123456789]                        # آی‌دی عددی ادمین‌ها (از @userinfobot)
SERVER_URL = "https://pasur11.liara.run"        # آدرس سرور تو روی لیارا (بدون / آخر)
ADMIN_KEY  = "CHANGE_ME_SECRET"                 # همان ADMIN_KEY در متغیرهای محیطی لیارا
# ==========================================================================

SERVER_URL = SERVER_URL.rstrip("/")


def is_admin(update: Update) -> bool:
    return bool(update.effective_user and update.effective_user.id in ADMIN_IDS)


def api_get(path: str, admin: bool = False):
    url = f"{SERVER_URL}/{path}.json"
    if admin:
        url += f"?key={ADMIN_KEY}"
    try:
        return requests.get(url, timeout=10).json()
    except Exception as e:
        return {"error": str(e)}


def api_put(path: str, value):
    url = f"{SERVER_URL}/{path}.json?key={ADMIN_KEY}"
    try:
        return requests.put(url, json=value, timeout=10).json()
    except Exception as e:
        return {"error": str(e)}


async def start(update: Update, ctx: ContextTypes.DEFAULT_TYPE):
    if not is_admin(update):
        return
    await update.message.reply_text(
        "🎴 ربات مدیریت پاسور ۱۱ (سرور لیارا)\n\n"
        "دستورها:\n"
        "/user <شناسه> — اطلاعات کاربر\n"
        "/users — فهرست کاربران\n"
        "/board — جدول رتبه‌بندی\n"
        "/ban <شناسه> — مسدودکردن\n"
        "/unban <شناسه> — رفع مسدودی\n"
        "/coins <شناسه> <تعداد> — هدیهٔ سکه\n"
        "/vip <شناسه> — فعال‌کردن VIP\n\n"
        "مثال: /coins 11-123456 500"
    )


async def user_cmd(update: Update, ctx: ContextTypes.DEFAULT_TYPE):
    if not is_admin(update):
        return
    if not ctx.args:
        await update.message.reply_text("مثال: /user 11-123456")
        return
    uid = ctx.args[0]
    info = api_get(f"users/{uid}")
    ctrl = api_get(f"control/{uid}")
    if not info:
        await update.message.reply_text(f"کاربری با شناسهٔ {uid} پیدا نشد.")
        return
    await update.message.reply_text(
        f"👤 کاربر {uid}\n"
        f"نام: {info.get('name','-')}  |  نام‌کاربری: @{info.get('user','-')}\n"
        f"سطح: {info.get('level','-')}  |  سکه: {info.get('coins','-')}  |  جام: {info.get('trophies','-')}\n"
        f"VIP: {'بله' if info.get('vip') else 'خیر'}\n"
        f"وضعیت کنترل: {ctrl}"
    )


async def users_cmd(update: Update, ctx: ContextTypes.DEFAULT_TYPE):
    if not is_admin(update):
        return
    data = api_get("users", admin=True) or {}
    if not isinstance(data, dict) or not data:
        await update.message.reply_text("هنوز کاربری ثبت نشده.")
        return
    ids = list(data.keys())
    lines = [f"{k} — {data[k].get('name','-')} (سطح {data[k].get('level','-')})" for k in ids[-20:]]
    await update.message.reply_text(f"تعداد کل: {len(ids)}\n\n۲۰ کاربر آخر:\n" + "\n".join(lines))


async def board_cmd(update: Update, ctx: ContextTypes.DEFAULT_TYPE):
    if not is_admin(update):
        return
    data = api_get("leaderboard") or {}
    if not isinstance(data, dict) or not data:
        await update.message.reply_text("جدول رتبه‌بندی خالی است.")
        return
    rows = sorted(data.values(), key=lambda x: x.get("t", 0), reverse=True)[:15]
    lines = [f"{i+1}. {r.get('n','-')} (@{r.get('u','-')}) — 🏆 {r.get('t',0)}"
             for i, r in enumerate(rows)]
    await update.message.reply_text("🏆 جدول رتبه‌بندی:\n" + "\n".join(lines))


async def ban_cmd(update: Update, ctx: ContextTypes.DEFAULT_TYPE):
    if not is_admin(update) or not ctx.args:
        return
    uid = ctx.args[0]
    api_put(f"control/{uid}/banned", True)
    await update.message.reply_text(f"⛔ کاربر {uid} مسدود شد.")


async def unban_cmd(update: Update, ctx: ContextTypes.DEFAULT_TYPE):
    if not is_admin(update) or not ctx.args:
        return
    uid = ctx.args[0]
    api_put(f"control/{uid}/banned", False)
    await update.message.reply_text(f"✅ مسدودی کاربر {uid} برداشته شد.")


async def coins_cmd(update: Update, ctx: ContextTypes.DEFAULT_TYPE):
    if not is_admin(update):
        return
    if len(ctx.args) < 2:
        await update.message.reply_text("مثال: /coins 11-123456 500")
        return
    uid, amount = ctx.args[0], int(ctx.args[1])
    cur = api_get(f"control/{uid}/coinGrant") or 0
    if not isinstance(cur, int):
        cur = 0
    api_put(f"control/{uid}/coinGrant", cur + amount)
    await update.message.reply_text(f"🪙 {amount} سکه برای کاربر {uid} ثبت شد.")


async def vip_cmd(update: Update, ctx: ContextTypes.DEFAULT_TYPE):
    if not is_admin(update) or not ctx.args:
        return
    uid = ctx.args[0]
    api_put(f"control/{uid}/vipGrant", True)
    await update.message.reply_text(f"👑 VIP برای کاربر {uid} ثبت شد.")


def main():
    app = Application.builder().token(BOT_TOKEN).build()
    for name, fn in [("start", start), ("user", user_cmd), ("users", users_cmd),
                     ("board", board_cmd), ("ban", ban_cmd), ("unban", unban_cmd),
                     ("coins", coins_cmd), ("vip", vip_cmd)]:
        app.add_handler(CommandHandler(name, fn))
    print("ربات پاسور ۱۱ (سرور لیارا) روشن شد...")
    app.run_polling()


if __name__ == "__main__":
    main()
