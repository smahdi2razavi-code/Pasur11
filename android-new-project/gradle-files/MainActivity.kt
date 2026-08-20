/* ============================================================================
 *  پاسور ۱۱ — MainActivity با درگاه پرداخت مایکت
 *
 *  ⚠️ فقط خط package زیر را با namespace پروژه‌ات یکی کن.
 *
 *  پیش‌نیازها (راهنمای-درگاه-پرداخت.md):
 *   ۱) settings.gradle.kts → repositories → maven { url = uri("https://jitpack.io") }
 *   ۲) build.gradle.kts (:app) → implementation("com.github.myketstore:myket-billing-client:1.19")
 *   ۳) build.gradle.kts (:app) → defaultConfig → manifestPlaceholders (سه مقدار مایکت)
 *   ۴) AndroidManifest.xml → دسترسی ir.mservices.market.BILLING
 *   ۵) implementation("androidx.webkit:webkit:1.11.0")
 * ========================================================================== */
package com.yourname.pasur11

import android.annotation.SuppressLint
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.view.View
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
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.webkit.WebViewAssetLoader
import ir.myket.billingclient.IabHelper

class MainActivity : ComponentActivity() {

    private lateinit var webView: WebView
    private lateinit var fileChooser: ActivityResultLauncher<Intent>
    private var filePathCallback: ValueCallback<Array<Uri>>? = null

    // اندازهٔ نوارهای سیستم که به بازی داده می‌شود
    private var insTop = 0
    private var insBottom = 0
    private var insLeft = 0
    private var insRight = 0
    private var haveInsets = false

    // --- درگاه پرداخت مایکت ---
    private var iab: IabHelper? = null
    private var iabReady = false
    private var buying = false          // جلوی باز شدن دو پنجرهٔ خرید هم‌زمان

    // 🔑 کلید عمومی درگاه (از پنل توسعه‌دهندهٔ مایکت)
    private val RSA_KEY =
        "MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQCN0IDYN2jeUYYJ3aY15CGTIG4wKNmmwVSvP3Vse9OyI/9b3OsR4dtvAwckscTzF3exM85aKKOr7XniceSdhsp8vxwQYhQ3ryWokODxVVWG3rIXRt0j6abFt95ElUN4md4z8vW1cHEWvFE5G/jTthZhI78Kgrq7IIiNZpXgaaDT0wIDAQAB"

    private val SKUS = listOf(
        "coins_500", "coins_1500", "coins_4000",
        "vip_subscription", "vip_subscription_2", "vip_subscription_3"
    )

    private val GAME_URL = "https://appassets.androidplatform.net/assets/index.html"

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

        WindowCompat.setDecorFitsSystemWindows(window, false)
        WindowCompat.getInsetsController(window, webView)
            .isAppearanceLightStatusBars = false

        // به وب‌ویو padding نمی‌دهیم تا نسبت تصویر عوض نشود؛ فقط اندازهٔ
        // نوارها را به بازی می‌گوییم و خودش محتوا را داخل‌تر می‌چیند.
        ViewCompat.setOnApplyWindowInsetsListener(webView) { _, insets ->
            val bars = insets.getInsets(
                WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout()
            )
            val ime = insets.getInsets(WindowInsetsCompat.Type.ime())
            val d = resources.displayMetrics.density.coerceAtLeast(1f)
            insTop    = (bars.top / d).toInt()
            insBottom = (maxOf(bars.bottom, ime.bottom) / d).toInt()
            insLeft   = (bars.left / d).toInt()
            insRight  = (bars.right / d).toInt()
            haveInsets = true
            pushInsetsToGame()
            insets
        }
        ViewCompat.requestApplyInsets(webView)

        webView.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            databaseEnabled = true
            allowFileAccess = true
            allowContentAccess = true
            useWideViewPort = true
            loadWithOverviewMode = true
            textZoom = 100                 // مستقل از اندازهٔ فونت گوشی
            setSupportZoom(false)          // زوم دو انگشتی چیدمان را خراب می‌کند
            builtInZoomControls = false
            displayZoomControls = false
            cacheMode = WebSettings.LOAD_DEFAULT
            mixedContentMode = WebSettings.MIXED_CONTENT_ALWAYS_ALLOW
        }
        webView.overScrollMode = View.OVER_SCROLL_NEVER
        webView.isVerticalScrollBarEnabled = false
        webView.isHorizontalScrollBarEnabled = false

        val assetLoader = WebViewAssetLoader.Builder()
            .addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(this))
            .build()

        webView.webViewClient = object : WebViewClient() {

            override fun shouldInterceptRequest(
                view: WebView,
                request: WebResourceRequest
            ): WebResourceResponse? = assetLoader.shouldInterceptRequest(request.url)

            override fun shouldOverrideUrlLoading(
                view: WebView,
                request: WebResourceRequest
            ): Boolean {
                if (request.url.host == "appassets.androidplatform.net") return false
                return try { startActivity(Intent(Intent.ACTION_VIEW, request.url)); true }
                catch (e: Exception) { true }
            }

            @Suppress("DEPRECATION")
            override fun shouldOverrideUrlLoading(view: WebView, url: String): Boolean {
                if (url.startsWith("https://appassets.androidplatform.net")) return false
                return try { startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url))); true }
                catch (e: Exception) { true }
            }

            override fun onPageFinished(view: WebView, url: String) {
                pushInsetsToGame()
                // خریدهای تحویل‌نشده بعد از آماده شدن صفحه دوباره تلاش می‌شوند
                if (iabReady) recoverPendingPurchases()
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
                return try { fileChooser.launch(params.createIntent()); true }
                catch (e: Exception) { filePathCallback = null; false }
            }

            override fun onPermissionRequest(request: PermissionRequest) = request.deny()
        }

        webView.addJavascriptInterface(JsBridge(), "AndroidApp")
        webView.addJavascriptInterface(BillingBridge(), "AndroidBilling")

        webView.loadUrl(GAME_URL)

        // آماده‌سازی درگاه مایکت
        try {
            iab = IabHelper(this, RSA_KEY)
            iab?.startSetup { result ->
                iabReady = result != null && result.isSuccess
                // اگر پولی پرداخت شده ولی کالا نرسیده، همین‌جا جبران می‌شود
                if (iabReady) recoverPendingPurchases()
            }
        } catch (e: Exception) {
            iabReady = false
        }

        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                webView.evaluateJavascript("(window.appBack ? window.appBack() : 'exit')") { v ->
                    if (v != null && v.contains("exit")) finish()
                }
            }
        })
    }

    /** پل عمومی بازی (باید public بماند؛ اندروید با reflection صدا می‌زند) */
    inner class JsBridge {
        @android.webkit.JavascriptInterface
        fun exit() { runOnUiThread { finish() } }

        @android.webkit.JavascriptInterface
        fun openMarket(pkg: String) {
            val id = pkg.replace("[^A-Za-z0-9._]".toRegex(), "")
            if (id.isEmpty()) return
            runOnUiThread {
                try {
                    startActivity(
                        Intent(Intent.ACTION_VIEW, Uri.parse("myket://details?id=$id"))
                            .setPackage("ir.mservices.market")
                    )
                    return@runOnUiThread
                } catch (e: Exception) { /* مایکت نصب نیست */ }
                try {
                    startActivity(Intent(Intent.ACTION_VIEW, Uri.parse("https://myket.ir/app/$id")))
                } catch (e2: Exception) {
                    Toast.makeText(this@MainActivity, "مایکت روی گوشی پیدا نشد",
                        Toast.LENGTH_LONG).show()
                }
            }
        }
    }

    /** پل خرید: بازی buy(sku) را صدا می‌زند */
    inner class BillingBridge {
        @android.webkit.JavascriptInterface
        fun buy(sku: String) { runOnUiThread { startPurchase(sku) } }

        /** بازی می‌تواند بپرسد درگاه آماده است یا نه */
        @android.webkit.JavascriptInterface
        fun ready(): Boolean = iabReady
    }

    private fun startPurchase(sku: String) {
        if (!SKUS.contains(sku)) { failJs("کالای ناشناخته"); return }
        val helper = iab
        if (helper == null || !iabReady) {
            failJs("درگاه پرداخت آماده نیست. مطمئن شو مایکت روی گوشی نصب است و این نسخهٔ بازی را از مایکت گرفته‌ای.")
            return
        }
        if (buying) return
        buying = true
        try {
            helper.launchPurchaseFlow(this, sku,
                IabHelper.OnIabPurchaseFinishedListener { result, purchase ->
                    buying = false
                    if (result == null || result.isFailure || purchase == null) {
                        val m = result?.message ?: ""
                        // انصراف خودِ کاربر پیام خطا لازم ندارد
                        if (!m.contains("cancel", true)) failJs("خرید انجام نشد. $m".trim())
                        return@OnIabPurchaseFinishedListener
                    }
                    if (purchase.sku != sku) return@OnIabPurchaseFinishedListener
                    val token = purchaseToken(purchase)
                    // اول مصرف تا کاربر بتواند دوباره بخرد، بعد تحویل
                    try { helper.consumeAsync(purchase) { _, _ -> grantJs(sku, token) } }
                    catch (e: Exception) { grantJs(sku, token) }
                }, "")
        } catch (e: Exception) {
            buying = false
            failJs("شروع خرید ممکن نشد")
        }
    }

    /** خریدهای پرداخت‌شده ولی تحویل‌نشده را پیدا و تحویل می‌دهد */
    private fun recoverPendingPurchases() {
        val helper = iab ?: return
        try {
            helper.queryInventoryAsync { result, inv ->
                if (result == null || result.isFailure || inv == null) return@queryInventoryAsync
                for (sku in SKUS) {
                    val purchase = try { inv.getPurchase(sku) } catch (e: Exception) { null } ?: continue
                    val token = purchaseToken(purchase)
                    try { helper.consumeAsync(purchase) { _, _ -> grantJs(sku, token) } }
                    catch (e: Exception) { grantJs(sku, token) }
                }
            }
        } catch (e: Exception) { /* دفعهٔ بعد دوباره تلاش می‌شود */ }
    }

    /** شناسهٔ یکتای خرید تا بازی یکی را دو بار حساب نکند */
    private fun purchaseToken(p: Any?): String = try {
        val m = p!!.javaClass.getMethod("getToken")
        (m.invoke(p) as? String) ?: p.toString()
    } catch (e: Exception) {
        try {
            val m2 = p!!.javaClass.getMethod("getOrderId")
            (m2.invoke(p) as? String) ?: System.currentTimeMillis().toString()
        } catch (e2: Exception) { System.currentTimeMillis().toString() }
    }

    private fun jsArg(s: String) = s.replace("\\", "").replace("'", "").replace("\n", " ")

    private fun grantJs(sku: String, token: String) {
        val s = jsArg(sku); val t = jsArg(token)
        val fn = if (sku.startsWith("vip_subscription")) "grantVip" else "grantPurchase"
        webView.post {
            webView.evaluateJavascript("window.$fn && window.$fn('$s','$t')", null)
        }
    }

    private fun failJs(msg: String) {
        val m = jsArg(msg)
        webView.post {
            webView.evaluateJavascript("window.onPurchaseFail && window.onPurchaseFail('$m')", null)
        }
    }

    private fun pushInsetsToGame() {
        if (!this::webView.isInitialized) return
        val js = StringBuilder()
            .append("document.documentElement.style.setProperty('--sat','").append(insTop).append("px');")
            .append("document.documentElement.style.setProperty('--sab','").append(insBottom).append("px');")
            .append("document.documentElement.style.setProperty('--sal','").append(insLeft).append("px');")
            .append("document.documentElement.style.setProperty('--sar','").append(insRight).append("px');")
        if (haveInsets) js.append("window.__insetsOK=1;")
        try { webView.evaluateJavascript(js.toString(), null) } catch (e: Exception) {}
    }

    override fun onPause() {
        super.onPause()
        webView.onPause()
        webView.pauseTimers()
    }

    override fun onResume() {
        super.onResume()
        webView.resumeTimers()
        webView.onResume()
        if (iabReady) recoverPendingPurchases()   // خرید نیمه‌تمام جا نماند
    }

    override fun onDestroy() {
        try { iab?.dispose() } catch (e: Exception) {}
        iab = null
        filePathCallback?.onReceiveValue(null)
        filePathCallback = null
        webView.stopLoading()
        webView.removeJavascriptInterface("AndroidApp")
        webView.removeJavascriptInterface("AndroidBilling")
        (webView.parent as? ViewGroup)?.removeView(webView)
        webView.destroy()
        super.onDestroy()
    }
}
