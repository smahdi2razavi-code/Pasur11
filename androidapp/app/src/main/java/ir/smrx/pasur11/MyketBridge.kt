package ir.smrx.pasur11

import android.app.Activity
import android.webkit.JavascriptInterface
import android.webkit.WebView
import androidx.activity.result.ActivityResultRegistry
import com.farasource.billing.BillingClient
import com.farasource.billing.BillingHelper
import com.farasource.billing.communication.OnBillingResultListener
import com.farasource.billing.util.Inventory
import com.farasource.billing.util.Purchase
import com.farasource.billing.util.TableCodes
import org.json.JSONArray
import org.json.JSONObject

/**
 * پل خرید مایکت بین اپلیکیشن اندروید و بازی (که یک صفحهٔ وب داخل WebView است).
 *
 * بازی این سه تابع را صدا می‌زند:
 *     MyketBilling.buy(sku, payload)
 *     MyketBilling.restore()
 *     MyketBilling.consume(token)
 *
 * و این کلاس نتیجه را با این توابع به بازی برمی‌گرداند:
 *     window.onMyketPurchase(json)
 *     window.onMyketRestore(jsonArray)
 *     window.onMyketError(message, sku)
 *
 * نکته: کتابخانه به‌صورت خودکار در هر بار وصل شدن، فهرست خریدهای مصرف‌نشده را
 * می‌خواند. یعنی اگر کاربر پول داده ولی وسط کار برنامه بسته شده، دفعهٔ بعد که
 * بازی را باز کند خریدش خودکار برمی‌گردد و اعمال می‌شود.
 *
 * هیچ چیزی در این فایل نیاز به تغییر ندارد.
 */
class MyketBridge(
    private val activity: Activity,
    private val web: WebView,
    private val registry: ActivityResultRegistry
) {

    private var billing: BillingClient? = null

    /** خریدهایی که هنوز مصرف نشده‌اند: توکن → خرید */
    private val pending = HashMap<String, Purchase>()

    var isReady = false
        private set

    private val listener = object : OnBillingResultListener {

        override fun onBillingSuccess(purchase: Purchase?) {
            if (purchase == null) return
            remember(purchase)
            runJs("window.onMyketPurchase && window.onMyketPurchase(${quote(toJson(purchase).toString())})")
        }

        override fun onConsumeFinished(purchase: Purchase?, success: Boolean) {
            val token = purchase?.token ?: return
            if (success) pending.remove(token)
        }

        override fun onBillingStatus(code: Int) {
            if (code == TableCodes.SETUP_SUCCESS) {
                isReady = true
                // به بازی خبر می‌دهیم درگاه آماده است تا دکمه‌های خرید فعال شوند
                runJs("window.dispatchEvent(new Event('myket-ready'))")
            } else {
                if (code == TableCodes.SETUP_FAILED || code == TableCodes.MARKET_NOT_INSTALLED) isReady = false
                runJs("window.onMyketError && window.onMyketError(${quote(messageFor(code))}, '')")
            }
        }

        override fun onQueryInventoryFinished(inventory: Inventory?) {
            val arr = JSONArray()
            val list = inventory?.allPurchases
            if (list != null) {
                for (p in list) {
                    remember(p)
                    arr.put(toJson(p))
                }
            }
            runJs("window.onMyketRestore && window.onMyketRestore(${quote(arr.toString())})")
        }
    }

    init {
        connect()
    }

    /** ساخت اتصال تازه به مایکت. خود کتابخانه بلافاصله فهرست خریدها را هم می‌خواند. */
    private fun connect() {
        try {
            val client = BillingClient(registry, activity)
            client.setGlobalAutoConsume(false)   // خرید تا وقتی سرور تأییدش نکرده مصرف نمی‌شود
            client.setOnBillingResultListener(listener)
            billing = client
        } catch (e: Exception) {
            isReady = false
            runJs("window.onMyketError && window.onMyketError(${quote("اتصال به مایکت برقرار نشد")}, '')")
        }
    }

    // ------------------------------------------------------------------
    //  توابعی که بازی صدا می‌زند
    // ------------------------------------------------------------------

    @JavascriptInterface
    fun buy(sku: String?, payload: String?) {
        if (sku.isNullOrEmpty()) return
        activity.runOnUiThread {
            val client = billing
            if (client == null || !isReady) {
                runJs("window.onMyketError && window.onMyketError(${quote("درگاه مایکت آماده نیست")}, ${quote(sku)})")
                return@runOnUiThread
            }
            try {
                // هر شش محصول پنل مایکت از نوع «محصول درون‌برنامه‌ای» هستند (نه اشتراک واقعی)،
                // پس نوع inapp درست است. بعد از تأیید سرور مصرف می‌شوند تا دوباره قابل خرید باشند.
                client.launchBilling(sku, BillingHelper.ITEM_TYPE_INAPP, payload ?: "", false)
            } catch (e: Exception) {
                runJs("window.onMyketError && window.onMyketError(${quote(e.message ?: "خطای ناشناخته")}, ${quote(sku)})")
            }
        }
    }

    @JavascriptInterface
    fun restore() {
        activity.runOnUiThread {
            try {
                // اتصال قبلی بسته و یک اتصال تازه ساخته می‌شود؛ کتابخانه هنگام
                // وصل شدن، خودش فهرست خریدها را می‌خواند و onQueryInventoryFinished
                // را صدا می‌زند. (این کتابخانه راه دیگری برای خواندن دوبارهٔ
                // فهرست روی همان اتصال ندارد.)
                billing?.endConnection()
                billing = null
                isReady = false
                connect()
            } catch (e: Exception) {
                runJs("window.onMyketRestore && window.onMyketRestore('[]')")
            }
        }
    }

    @JavascriptInterface
    fun consume(token: String?) {
        if (token.isNullOrEmpty()) return
        val purchase = pending[token] ?: return
        activity.runOnUiThread {
            try {
                billing?.consume(purchase)
            } catch (e: Exception) {
                // اگر مصرف نشد اشکالی ندارد؛ در اتصال بعدی دوباره دیده و تلاش می‌شود
            }
        }
    }

    // ------------------------------------------------------------------
    //  کمکی‌ها
    // ------------------------------------------------------------------

    fun release() {
        try { billing?.endConnection() } catch (e: Exception) { }
        billing = null
    }

    private fun remember(p: Purchase) {
        val token = p.token
        if (!token.isNullOrEmpty()) pending[token] = p
    }

    private fun toJson(p: Purchase): JSONObject {
        val o = JSONObject()
        o.put("sku", p.sku ?: "")
        o.put("purchaseData", p.originalJson ?: "")   // باید دقیقاً همان رشتهٔ خام مایکت باشد
        o.put("signature", p.signature ?: "")
        o.put("purchaseToken", p.token ?: "")
        o.put("orderId", p.orderId ?: "")
        return o
    }

    /** رشته را برای گذاشتن داخل کد جاوااسکریپت امن می‌کند */
    private fun quote(s: String): String = JSONObject.quote(s)

    private fun runJs(js: String) {
        activity.runOnUiThread {
            try { web.evaluateJavascript(js, null) } catch (e: Exception) { }
        }
    }

    private fun messageFor(code: Int): String = when (code) {
        TableCodes.MARKET_NOT_INSTALLED -> "برنامهٔ مایکت روی گوشی نصب نیست"
        TableCodes.NO_NETWORK -> "اینترنت در دسترس نیست"
        TableCodes.BILLING_IS_IN_PROGRESS -> "یک لحظه صبر کن؛ خرید قبلی هنوز تمام نشده"
        TableCodes.SUBSCRIPTIONS_NOT_SUPPORTED -> "این نسخهٔ مایکت اشتراک را پشتیبانی نمی‌کند"
        TableCodes.SETUP_FAILED -> "اتصال به مایکت برقرار نشد"
        TableCodes.BILLING_FAILED -> "خرید کامل نشد یا لغو شد"
        TableCodes.BILLING_DISPOSED -> "cancel"      // بازی این را «خرید لغو شد» می‌فهمد
        else -> "خطای مایکت ($code)"
    }
}
