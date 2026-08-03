/* ============================================================================
 *  MainActivity.kt  —  نسخهٔ کامل پاسور ۱۱ (کاتلین)
 *  این فایل دو کار را انجام می‌دهد:
 *    ۱) بازی را از داخل خود اپ باز می‌کند (نه از اینترنت) → آپدیت فقط از اندروید استودیو
 *    ۲) درگاه پرداخت مایکت را وصل می‌کند (خرید سکه و VIP)
 *
 *  ⚠ قبل از استفاده از بخش پرداخت، این سه کار باید انجام شده باشد
 *    (اگر انجام نشده، فعلاً از نسخهٔ «بدون پرداخت» در راهنما استفاده کن):
 *      الف) فایل‌های صورت‌حساب مایکت (IabHelper و فایل‌های AIDL) از نمونهٔ رسمی
 *           مایکت به پروژه اضافه شده باشد.
 *      ب) در AndroidManifest.xml دسترسی «ir.mservices.market.BILLING» اضافه شده باشد.
 *      ج) در build.gradle.kts خط «aidl = true» اضافه شده باشد.
 *  بعد از اضافه‌کردن فایل‌های مایکت، اندروید استودیو زیر import ها خط قرمز می‌کشد؛
 *  روی هرکدام Alt+Enter بزن تا خودش import درست را بیاورد.
 * ========================================================================== */

package com.yourname.pasur11   // ← اگر applicationId را عوض کردی، این را دست نزن

import android.annotation.SuppressLint
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.view.ViewGroup
import android.webkit.PermissionRequest
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.OnBackPressedCallback
import androidx.activity.result.ActivityResultLauncher
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
// ↓↓↓ این دو import از فایل‌های نمونهٔ مایکت می‌آیند (با Alt+Enter کامل می‌شود) ↓↓↓
import ir.myket.billingclient.util.IabHelper
import ir.myket.billingclient.util.Purchase

class MainActivity : AppCompatActivity() {

    private lateinit var webView: WebView

    // برای اینکه «انتخاب عکس» (آواتار پروفایل) داخل اپ کار کند
    private var filePathCallback: ValueCallback<Array<Uri>>? = null
    private lateinit var fileChooser: ActivityResultLauncher<Intent>

    // --- پرداخت مایکت ---
    private var iab: IabHelper? = null
    private var iabReady = false
    private val RC_PURCHASE = 1001
    // 🔑 کلید عمومی درگاه تو (از پنل توسعه‌دهندهٔ مایکت):
    private val RSA_KEY =
        "MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQCN0IDYN2jeUYYJ3aY15CGTIG4wKNmmwVSvP3Vse9OyI/9b3OsR4dtvAwckscTzF3exM85aKKOr7XniceSdhsp8vxwQYhQ3ryWokODxVVWG3rIXRt0j6abFt95ElUN4md4z8vW1cHEWvFE5G/jTthZhI78Kgrq7IIiNZpXgaaDT0wIDAQAB"

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        fileChooser = registerForActivityResult(
            ActivityResultContracts.StartActivityForResult()
        ) { result ->
            val uris = WebChromeClient.FileChooserParams.parseResult(result.resultCode, result.data)
            filePathCallback?.onReceiveValue(uris)
            filePathCallback = null
        }

        webView = findViewById(R.id.webview)
        webView.setBackgroundColor(0xFF0A0A0C.toInt()) // رفع فلش سفید هنگام باز شدن

        webView.settings.apply {
            javaScriptEnabled = true              // اجرای بازی
            domStorageEnabled = true              // ذخیرهٔ بازی، سکه‌ها و پروفایل کاربر
            databaseEnabled = true
            allowFileAccess = true
            allowContentAccess = true
            useWideViewPort = true                // ابعاد درست در همهٔ گوشی‌ها
            loadWithOverviewMode = true
            cacheMode = WebSettings.LOAD_DEFAULT
        }

        webView.webViewClient = WebViewClient()

        webView.webChromeClient = object : WebChromeClient() {
            override fun onShowFileChooser(
                view: WebView,
                callback: ValueCallback<Array<Uri>>,
                params: FileChooserParams
            ): Boolean {
                filePathCallback?.onReceiveValue(null)
                filePathCallback = callback
                return try {
                    fileChooser.launch(params.createIntent())
                    true
                } catch (e: Exception) {
                    filePathCallback = null
                    false
                }
            }

            override fun onPermissionRequest(request: PermissionRequest) {
                request.grant(request.resources)  // برای بازی دو نفره روی وای‌فای
            }
        }

        // پل خروج: دکمهٔ «خروج» داخل بازی از این استفاده می‌کند
        webView.addJavascriptInterface(object {
            @android.webkit.JavascriptInterface
            fun exit() { runOnUiThread { finish() } }
        }, "AndroidApp")

        // پل پرداخت: وقتی کاربر روی «خرید» می‌زند، بازی buy(...) را صدا می‌زند
        webView.addJavascriptInterface(object {
            @android.webkit.JavascriptInterface
            fun buy(sku: String) { runOnUiThread { startPurchase(sku) } }
        }, "AndroidBilling")

        // ✅ بازی را از داخل خود اپ باز کن (نه از اینترنت)
        //    → دیگر تغییرات گیت‌هاب روی اپ نصب‌شده اثر ندارند؛ آپدیت فقط از اندروید استودیو
        webView.loadUrl("file:///android_asset/index.html")

        // آماده‌سازی درگاه مایکت
        iab = IabHelper(this, RSA_KEY)
        iab?.startSetup { result -> iabReady = result.isSuccess }

        // دکمهٔ برگشت گوشی: به خود بازی می‌گوییم؛ بازی اول از کاربر تأیید می‌گیرد
        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                webView.evaluateJavascript("window.appBack ? window.appBack() : 'exit'") { v ->
                    if (v != null && v.contains("exit")) finish()
                }
            }
        })
    }

    /** شروع خرید یک بسته (coins_500 / coins_1500 / coins_4000 / vip_subscription) */
    private fun startPurchase(sku: String) {
        val helper = iab ?: return
        if (!iabReady) return
        helper.launchPurchaseFlow(this, sku, RC_PURCHASE, { result, purchase ->
            if (result.isFailure || purchase == null) return@launchPurchaseFlow
            if (purchase.sku != sku) return@launchPurchaseFlow
            if (sku == "vip_subscription") {
                grantVipJs()                                   // VIP: مصرف نمی‌شود
            } else {
                helper.consumeAsync(purchase) { _, _ -> grantPurchaseJs(sku) } // سکه‌ها مصرف می‌شوند
            }
        }, "")
    }

    /** بعد از خرید موفق، به بازی خبر می‌دهیم تا سکه‌ها را اضافه کند */
    private fun grantPurchaseJs(sku: String) {
        webView.post { webView.evaluateJavascript("window.grantPurchase('$sku')", null) }
    }
    private fun grantVipJs() {
        webView.post { webView.evaluateJavascript("window.grantVip()", null) }
    }

    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        // اجازه بده مایکت اول نتیجهٔ خرید را بررسی کند
        if (iab?.handleActivityResult(requestCode, resultCode, data) == true) return
        super.onActivityResult(requestCode, resultCode, data)
    }

    override fun onDestroy() {
        try { iab?.dispose() } catch (e: Exception) {}
        iab = null
        (webView.parent as? ViewGroup)?.removeView(webView)
        webView.destroy()
        super.onDestroy()
    }
}
