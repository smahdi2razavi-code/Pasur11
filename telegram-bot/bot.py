# -*- coding: utf-8 -*-
"""
ربات مدیریت کاربران پاسور ۱۱ (کنترل با «شناسهٔ کاربری»)
--------------------------------------------------------
این ربات با دیتابیس Firebase بازی کار می‌کند. بازی هر کاربر را زیر مسیر
/users/<userId> ذخیره می‌کند و دستورهای مدیریتی زیر مسیر /control/<userId>
خوانده می‌شوند. بازی این دستورها را موقع اجرا اعمال می‌کند
(مسدودسازی، هدیهٔ سکه، فعال‌سازی VIP).

پیش‌نیازها:
  pip install python-telegram-bot firebase-admin
  یک پروژهٔ Firebase + فایل serviceAccountKey.json (از Project Settings > Service accounts)

قبل از اجرا، چهار مقدار زیر را پر کن.
"""

import firebase_admin
from firebase_admin import credentials, db
from telegram import Update
from telegram.ext import Application, CommandHandler, ContextTypes

# ===================== تنظیمات (این چهار مورد را پر کن) =====================
BOT_TOKEN       = "PUT_YOUR_TELEGRAM_BOT_TOKEN"          # از @BotFather بگیر
ADMIN_IDS       = [123456789]                            # آی‌دی عددی تلگرام ادمین‌ها (از @userinfobot)
DATABASE_URL    = "https://YOUR-PROJECT.firebaseio.com"  # آدرس Realtime Database
SERVICE_ACCOUNT = "serviceAccountKey.json"               # فایل کلید سرویس Firebase
# ==========================================================================

cred = credentials.Certificate(SERVICE_ACCOUNT)
firebase_admin.initialize_app(cred, {"databaseURL": DATABASE_URL})


def is_admin(update: Update) -> bool:
    return bool(update.effective_user and update.effective_user.id in ADMIN_IDS)


async def start(update: Update, ctx: ContextTypes.DEFAULT_TYPE):
    if not is_admin(update):
        return
    await update.message.reply_text(
        "🎴 ربات مدیریت پاسور ۱۱\n\n"
        "دستورها:\n"
        "/user <شناسه> — نمایش اطلاعات کاربر\n"
        "/users — فهرست ۲۰ کاربر آخر\n"
        "/ban <شناسه> — مسدودکردن کاربر\n"
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
    info = db.reference(f"/users/{uid}").get()
    ctrl = db.reference(f"/control/{uid}").get()
    if not info and not ctrl:
        await update.message.reply_text(f"کاربری با شناسهٔ {uid} پیدا نشد.")
        return
    await update.message.reply_text(
        f"👤 کاربر {uid}\n"
        f"اطلاعات: {info}\n"
        f"وضعیت کنترل: {ctrl}"
    )


async def users_cmd(update: Update, ctx: ContextTypes.DEFAULT_TYPE):
    if not is_admin(update):
        return
    all_users = db.reference("/users").get() or {}
    ids = list(all_users.keys())[-20:]
    if not ids:
        await update.message.reply_text("هنوز کاربری ثبت نشده.")
        return
    await update.message.reply_text("۲۰ کاربر آخر:\n" + "\n".join(ids))


async def ban_cmd(update: Update, ctx: ContextTypes.DEFAULT_TYPE):
    if not is_admin(update):
        return
    uid = ctx.args[0]
    db.reference(f"/control/{uid}/banned").set(True)
    await update.message.reply_text(f"⛔ کاربر {uid} مسدود شد.")


async def unban_cmd(update: Update, ctx: ContextTypes.DEFAULT_TYPE):
    if not is_admin(update):
        return
    uid = ctx.args[0]
    db.reference(f"/control/{uid}/banned").set(False)
    await update.message.reply_text(f"✅ مسدودی کاربر {uid} برداشته شد.")


async def coins_cmd(update: Update, ctx: ContextTypes.DEFAULT_TYPE):
    if not is_admin(update):
        return
    if len(ctx.args) < 2:
        await update.message.reply_text("مثال: /coins 11-123456 500")
        return
    uid, amount = ctx.args[0], int(ctx.args[1])
    ref = db.reference(f"/control/{uid}/coinGrant")
    current = ref.get() or 0
    ref.set(current + amount)  # بازی دفعهٔ بعد این سکه‌ها را اضافه و صفر می‌کند
    await update.message.reply_text(f"🪙 {amount} سکه برای کاربر {uid} ثبت شد.")


async def vip_cmd(update: Update, ctx: ContextTypes.DEFAULT_TYPE):
    if not is_admin(update):
        return
    uid = ctx.args[0]
    db.reference(f"/control/{uid}/vipGrant").set(True)
    await update.message.reply_text(f"👑 VIP برای کاربر {uid} ثبت شد.")


def main():
    app = Application.builder().token(BOT_TOKEN).build()
    app.add_handler(CommandHandler("start", start))
    app.add_handler(CommandHandler("user", user_cmd))
    app.add_handler(CommandHandler("users", users_cmd))
    app.add_handler(CommandHandler("ban", ban_cmd))
    app.add_handler(CommandHandler("unban", unban_cmd))
    app.add_handler(CommandHandler("coins", coins_cmd))
    app.add_handler(CommandHandler("vip", vip_cmd))
    print("ربات پاسور ۱۱ روشن شد...")
    app.run_polling()


if __name__ == "__main__":
    main()
