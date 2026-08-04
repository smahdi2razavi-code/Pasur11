/* ============================================================================
 *  MainActivity.kt  —  نسخهٔ کامل با درگاه پرداخت مایکت (پروژهٔ com.SMRx.pasur11)
 *  این نسخه علاوه بر اجرای بازی از داخل اپ، خرید درون‌برنامه‌ای مایکت را وصل می‌کند.
 *
 *  ⚠ پیش‌نیازها (در راهنما قدم‌به‌قدم آمده):
 *    ۱) در settings.gradle.kts مخزن jitpack اضافه شده باشد.
 *    ۲) در build.gradle.kts این خط باشد:
 *          implementation("com.github.myketstore:myket-billing-client:1.19")
 *    ۳) در AndroidManifest.xml دسترسی «ir.mservices.market.BILLING» اضافه شده باشد.
 *    (این کتابخانه نیازی به فایل AIDL و onActivityResult ندارد.)
 * ========================================================================== */

package com.SMRx.pasur11

import android.annotation.SuppressLint
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
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.OnBackPressedCallback
import androidx.activity.result.ActivityResultLauncher
import androidx.activity.result.contract.ActivityResultContracts
import androidx.webkit.WebViewAssetLoader
import ir.myket.billingclient.IabHelper

class MainActivity : ComponentActivity() {

    private lateinit var webView: WebView

    private var filePathCallback: ValueCallback<Array<Uri>>? = null
    private lateinit var fileChooser: ActivityResultLauncher<android.content.Intent>

    // --- درگاه پرداخت مایکت ---
    private var iab: IabHelper? = null
    private var iabReady = false
    // 🔑 کلید عمومی درگاه تو (از پنل توسعه‌دهندهٔ مایکت):
    private val RSA_KEY =
        "MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQCN0IDYN2jeUYYJ3aY15CGTIG4wKNmmwVSvP3Vse9OyI/9b3OsR4dtvAwckscTzF3exM85aKKOr7XniceSdhsp8vxwQYhQ3ryWokODxVVWG3rIXRt0j6abFt95ElUN4md4z8vW1cHEWvFE5G/jTthZhI78Kgrq7IIiNZpXgaaDT0wIDAQAB"

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        fileChooser = registerForActivityResult(
            ActivityResultContracts.StartActivityForResult()
        ) { result ->
            val uris = WebChromeClient.FileChooserParams.parseResult(result.resultCode, result.data)
            filePathCallback?.onReceiveValue(uris)
            filePathCallback = null
        }

        webView = WebView(this)
        setContentView(webView)
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
        val helper = iab
        if (helper == null || !iabReady) {
            Toast.makeText(this,
                "درگاه پرداخت آماده نیست. مطمئن شو مایکت روی گوشی نصب است و این نسخهٔ اپ از مایکت نصب شده و محصول‌ها در پنل مایکت ساخته شده‌اند.",
                Toast.LENGTH_LONG).show()
            return
        }
        helper.launchPurchaseFlow(this, sku,
            IabHelper.OnIabPurchaseFinishedListener { result, purchase ->
                if (result.isFailure || purchase == null) {
                    Toast.makeText(this, "خرید انجام نشد: " + result.message, Toast.LENGTH_LONG).show()
                    return@OnIabPurchaseFinishedListener
                }
                if (purchase.sku != sku) return@OnIabPurchaseFinishedListener
                if (sku == "vip_subscription") {
                    grantVipJs()                                  // VIP: مصرف نمی‌شود
                } else {
                    helper.consumeAsync(purchase) { _, _ -> grantPurchaseJs(sku) } // سکه: مصرف می‌شود
                }
            }, "")
    }

    private fun grantPurchaseJs(sku: String) {
        webView.post { webView.evaluateJavascript("window.grantPurchase('$sku')", null) }
    }
    private fun grantVipJs() {
        webView.post { webView.evaluateJavascript("window.grantVip()", null) }
    }

    override fun onDestroy() {
        try { iab?.dispose() } catch (e: Exception) {}
        iab = null
        (webView.parent as? ViewGroup)?.removeView(webView)
        webView.destroy()
        super.onDestroy()
    }
}
