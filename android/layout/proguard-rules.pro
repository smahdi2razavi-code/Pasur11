# پل خرید نباید توسط ProGuard حذف یا تغییر نام داده شود،
# وگرنه در نسخهٔ release دکمهٔ خرید کار نمی‌کند.
-keepclassmembers class ir.smrx.pasur11.MyketBridge {
    public *;
}
-keepattributes JavascriptInterface
-keep class com.farasource.billing.** { *; }
