package ir.smrx.pasur11

import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.webkit.JavascriptInterface

/**
 * پل عمومی اپلیکیشن ↔ بازی (شیء AndroidApp داخل صفحه).
 *
 * بازی این‌ها را صدا می‌زند:
 *     AndroidApp.exit()             → بستن برنامه
 *     AndroidApp.openMarket(pkg)    → باز کردن صفحهٔ برنامه در مایکت
 *
 * وجود همین شیء به بازی می‌فهماند که داخل اپ اجرا می‌شود (نه در مرورگر)،
 * و بازی سرویس‌ورکر را خاموش می‌کند تا با WebViewAssetLoader تداخل نکند.
 */
class AppBridge(private val activity: Activity) {

    @JavascriptInterface
    fun exit() {
        activity.runOnUiThread { activity.finish() }
    }

    @JavascriptInterface
    fun openMarket(pkg: String?) {
        val target = if (pkg.isNullOrEmpty()) activity.packageName else pkg
        activity.runOnUiThread {
            // اول تلاش می‌کنیم صفحهٔ برنامه را داخل خود مایکت باز کنیم
            try {
                val i = Intent(Intent.ACTION_VIEW, Uri.parse("myket://details?id=$target"))
                i.setPackage("ir.mservices.market")
                i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                activity.startActivity(i)
                return@runOnUiThread
            } catch (e: Exception) { }
            // اگر مایکت نصب نبود، در مرورگر
            try {
                val i = Intent(Intent.ACTION_VIEW, Uri.parse("https://myket.ir/app/$target"))
                i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                activity.startActivity(i)
            } catch (e: Exception) { }
        }
    }
}
