# ساخت APK کلیددار (امضاشده) در اندروید استودیو — ۰ تا ۱۰۰

برای انتشار در مایکت باید APK «امضاشده» بسازی. امضا مثل یک شناسنامهٔ ثابت برای
اپ توست؛ همهٔ آپدیت‌های بعدی باید با **همان کلید** امضا شوند. پس فایل کلید و
رمزهایش را حتماً جای امن نگه دار (اگر گم شوند دیگر نمی‌توانی اپت را آپدیت کنی).

---

## گام ۱ — باز کردن پنجرهٔ ساخت
در اندروید استودیو، از منوی بالا:
**`Build`** → **`Generate Signed Bundle / APK...`**

## گام ۲ — انتخاب نوع
گزینهٔ **`APK`** را انتخاب کن (نه Android App Bundle) → **`Next`**.

## گام ۳ — ساخت کلید امضا (فقط بار اول)
زیر کادر **Key store path**، روی **`Create new...`** بزن و فرم را پر کن:
- **Key store path:** یک محل و اسم برای فایل کلید انتخاب کن، مثلاً:
  `C:\Users\SMR\pasur11-key.jks`  (این فایل را گم نکن!)
- **Password / Confirm:** یک رمز برای فایل کلید بگذار (یادداشتش کن).
- **Alias:** یک اسم برای کلید، مثلاً `pasur11`.
- **Key Password / Confirm:** یک رمز برای خود کلید (می‌تواند همان رمز بالا باشد).
- **Validity (years):** `25` یا بیشتر.
- **Certificate:** حداقل «First and Last Name» را پر کن (بقیه اختیاری).
- **`OK`** را بزن.

> بار دوم به بعد لازم نیست کلید بسازی؛ فقط با **`Choose existing...`** همان فایل
> `.jks` را انتخاب کن و رمزها را وارد کن.

## گام ۴ — تأیید کلید
حالا در پنجرهٔ اصلی، مسیر کلید و رمزها پر شده‌اند. تیک **`Remember passwords`** را
بزن تا دفعهٔ بعد راحت‌تر باشی → **`Next`**.

## گام ۵ — انتخاب نسخهٔ خروجی
- **Build Variants:** گزینهٔ **`release`** را انتخاب کن.
- (اگر گزینهٔ Signature Versions بود، هر دو تیک V1 و V2 را بزن.)
- **`Create`** / **`Finish`** را بزن.

## گام ۶ — پیدا کردن فایل APK
چند لحظه صبر کن؛ پایین‌ راست پیام **`APK(s) generated successfully`** می‌آید و یک
لینک **`locate`** دارد. رویش بزن تا پوشهٔ خروجی باز شود. فایل معمولاً اینجاست:
`app/release/app-release.apk`

همین فایل `app-release.apk` را در پنل مایکت آپلود کن. 🎉

---

## ❗ رفع خطای «Could not find ... lint-gradle» (تحریم گوگل)
اگر هنگام ساخت این خطا را دیدی:
> Could not resolve all files for configuration ':app:androidLintTool'
> Could not find com.android.tools.lint:lint-gradle:32.2.1

علتش تحریم است: گریدل نمی‌تواند از `dl.google.com` دانلود کند. راه‌حل، استفاده از
**آینهٔ ایرانی مایکت** است.

### راه‌حل ۱ (اصلی) — افزودن آینهٔ مایکت
فایل **`settings.gradle.kts`** (در ریشهٔ پروژه) را باز کن. باید دو بخش
`repositories` داشته باشد؛ در **هر دو**، خط آینه را **اول از همه** اضافه کن:

```kotlin
pluginManagement {
    repositories {
        maven { url = uri("https://maven.myket.ir") }   // ← اضافه شد
        google()
        mavenCentral()
        gradlePluginPortal()
    }
}
dependencyResolutionManagement {
    repositories {
        maven { url = uri("https://maven.myket.ir") }   // ← اضافه شد
        google()
        mavenCentral()
        maven { url = uri("https://jitpack.io") }
    }
}
```
سپس `Ctrl+S` → **Sync Now** → دوباره APK بساز.

### راه‌حل ۲ (کمکی) — خاموش‌کردن lint در نسخهٔ انتشار
اگر باز هم خطای lint گرفتی، در **`build.gradle.kts (:app)`** داخل بخش
`android { ... }` این را اضافه کن:
```kotlin
lint {
    checkReleaseBuilds = false
    abortOnError = false
}
```
این فقط بررسی خودکار کد را خاموش می‌کند و روی خود بازی هیچ اثری ندارد.

> پیشنهاد: اول راه‌حل ۱ را بزن. اگر جواب نداد، راه‌حل ۲ را هم اضافه کن.

## رفع هشدار «compile SDK version 37.1»
اگر هنگام ساخت این پیام را دیدی:
> We recommend using a newer Android Gradle plugin to use compile SDK version 37.1 ...

این فقط یک **هشدار (warning)** است، **نه خطا** — یعنی APK با موفقیت ساخته می‌شود و
مشکلی برای مایکت ندارد. برای اینکه دیگر نشانش ندهد، یکی از این دو کار را بکن:

**راه ساده (پیشنهادی):** فایل `gradle.properties` (در ریشهٔ پروژه) را باز کن و این خط
را به آخرش اضافه کن، بعد یک‌بار `Sync Now` بزن:
```
android.suppressUnsupportedCompileSdk=37.1
```

**یا** در `build.gradle.kts (:app)` مقدار `compileSdk = 37` را نگه دار (عدد صحیح ۳۷).
اگر جایی `compileSdk = 37.1` بود، به `37` تغییرش بده. (نسخهٔ ۳۷ کافی است.)

> خلاصه: این پیام جلوی ساخت APK را نمی‌گیرد؛ فقط یک توصیه است. با خط بالا کاملاً ساکت می‌شود.

## نکات مهم
- **بکاپ کلید:** فایل `.jks` و رمزهایش را در چند جای امن نگه دار (فلش، ایمیل خودت،
  فضای ابری). بدون آن‌ها آپدیت اپ در آینده ممکن نیست.
- **افزایش نسخه برای هر آپدیت:** قبل از هر آپدیت جدید، در `build.gradle.kts`
  عدد `versionCode` را یکی زیاد کن (مثلاً ۱ → ۲) و در صورت تمایل `versionName`
  را هم عوض کن (مثلاً "1.0" → "1.1"). مایکت نسخهٔ با versionCode بزرگ‌تر را می‌پذیرد.
- **قبل از ساخت نهایی:** آخرین `index.html` را در پوشهٔ `assets` گذاشته باشی تا
  نسخهٔ به‌روز بازی داخل APK باشد.
