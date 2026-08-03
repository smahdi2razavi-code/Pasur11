/* ============================================================================
 *  MainActivity.kt  —  نسخهٔ کامل پاسور ۱۱ (کاتلین) — روش WebViewAssetLoader
 *  این فایل دو کار را انجام می‌دهد:
 *    ۱) بازی را از داخل خود اپ سرو می‌کند (روش رسمی گوگل) → آپدیت فقط از اندروید استودیو
 *    ۲) درگاه پرداخت مایکت را وصل می‌کند (خرید سکه و VIP)
 *
 *  ⚠ پیش‌نیازها:
 *    - در build.gradle.kts در بخش dependencies این خط باشد:
 *          implementation("androidx.webkit:webkit:1.11.0")
 *    - برای بخش پرداخت: فایل‌های صورت‌حساب مایکت (IabHelper و AIDL) اضافه شده،
 *      دسترسی «ir.mservices.market.BILLING» در مانیفست، و «aidl = true» در گریدل.
 *  بعد از افزودن فایل‌های مایکت، روی import های قرمز Alt+Enter بزن.
 * ========================================================================== */

package com.yourname.pasur11

import android.annotation.SuppressLint
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.view.ViewGroup
import android.webkit.PermissionRequest
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.OnBackPressedCallback
import androidx.activity.result.ActivityResultLauncher
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.webkit.WebViewAssetLoader
// ↓↓↓ این دو import از فایل‌های نمونهٔ مایکت می‌آیند (با Alt+Enter کامل می‌شود) ↓↓↓
import ir.myket.billingclient.util.IabHelper
import ir.myket.billingclient.util.Purchase

class MainActivity : AppCompatActivity() {

    private lateinit var webView: WebView

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
        webView.setBackgroundColor(0xFF0A0A0C.toInt())

        webView.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            databaseEnabled = true
            allowFileAccess = true
            allowContentAccess = true
            useWideViewPort = true
            loadWithOverviewMode = true
            cacheMode = WebSettings.LOAD_DEFAULT
        }

        // روش رسمی گوگل: فایل‌های داخل assets را مثل یک سایت محلی امن سرو می‌کند
        val assetLoader = WebViewAssetLoader.Builder()
            .addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(this))
            .build()

        webView.webViewClient = object : WebViewClient() {
            override fun shouldInterceptRequest(
                view: WebView,
                request: WebResourceRequest
            ): WebResourceResponse? {
                return assetLoader.shouldInterceptRequest(request.url)
            }
        }

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
                request.grant(request.resources)
            }
        }

        // پل خروج
        webView.addJavascriptInterface(object {
            @android.webkit.JavascriptInterface
            fun exit() { runOnUiThread { finish() } }
        }, "AndroidApp")

        // پل پرداخت: بازی buy(...) را صدا می‌زند
        webView.addJavascriptInterface(object {
            @android.webkit.JavascriptInterface
            fun buy(sku: String) { runOnUiThread { startPurchase(sku) } }
        }, "AndroidBilling")

        // ✅ بازی از داخل خود اپ سرو می‌شود (آدرس محلیِ امن، نه اینترنت)
        webView.loadUrl("https://appassets.androidplatform.net/assets/index.html")

        // آماده‌سازی درگاه مایکت
        iab = IabHelper(this, RSA_KEY)
        iab?.startSetup { result -> iabReady = result.isSuccess }

        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                webView.evaluateJavascript("window.appBack ? window.appBack() : 'exit'") { v ->
                    if (v != null && v.contains("exit")) finish()
                }
            }
        })
    }

    /** شروع خرید (coins_500 / coins_1500 / coins_4000 / vip_subscription) */
    private fun startPurchase(sku: String) {
        val helper = iab ?: return
        if (!iabReady) return
        helper.launchPurchaseFlow(this, sku, RC_PURCHASE, { result, purchase ->
            if (result.isFailure || purchase == null) return@launchPurchaseFlow
            if (purchase.sku != sku) return@launchPurchaseFlow
            if (sku == "vip_subscription") {
                grantVipJs()
            } else {
                helper.consumeAsync(purchase) { _, _ -> grantPurchaseJs(sku) }
            }
        }, "")
    }

    private fun grantPurchaseJs(sku: String) {
        webView.post { webView.evaluateJavascript("window.grantPurchase('$sku')", null) }
    }
    private fun grantVipJs() {
        webView.post { webView.evaluateJavascript("window.grantVip()", null) }
    }

    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
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
