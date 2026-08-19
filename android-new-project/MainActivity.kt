/* ============================================================================
 *  پاسور ۱۱ — MainActivity
 *  نسخهٔ بازبینی‌شده و کامل. بدون فایل layout و بدون هیچ ارجاعی به R،
 *  پس خطای «Unresolved reference: R» هرگز پیش نمی‌آید.
 *
 *  ⚠️ تنها چیزی که باید عوض کنی، خط package زیر است:
 *     باید دقیقاً برابر مقدار namespace در build.gradle.kts باشد.
 *     (نام بستهٔ فروشگاه یعنی applicationId چیز دیگری است و اینجا نمی‌آید.)
 *
 *  پیش‌نیاز در build.gradle.kts:
 *     implementation("androidx.webkit:webkit:1.11.0")
 * ========================================================================== */
package com.smahdi2razavi.pasur11

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

class MainActivity : ComponentActivity() {

    private lateinit var webView: WebView
    private lateinit var fileChooser: ActivityResultLauncher<Intent>
    private var filePathCallback: ValueCallback<Array<Uri>>? = null

    /** اندازهٔ نوارهای سیستم (بر حسب واحد CSS) که به بازی داده می‌شود */
    private var insTop = 0
    private var insBottom = 0
    private var insLeft = 0
    private var insRight = 0

    /** تا وقتی اندروید یک بار واقعاً اندازهٔ نوارها را نداده، به بازی نمی‌گوییم
     *  «حساب شد». وگرنه بازی حالت پشتیبان خودش را روشن نمی‌کند و محتوا
     *  ممکن است زیر ساعت و باتری برود. */
    private var haveInsets = false

    private val GAME_URL = "https://appassets.androidplatform.net/assets/index.html"

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // انتخاب عکس برای پروفایل
        fileChooser = registerForActivityResult(
            ActivityResultContracts.StartActivityForResult()
        ) { result ->
            val uris = WebChromeClient.FileChooserParams.parseResult(result.resultCode, result.data)
            filePathCallback?.onReceiveValue(uris)
            filePathCallback = null
        }

        // وب‌ویو را مستقیم در کد می‌سازیم؛ هیچ فایل layout ای لازم نیست
        webView = WebView(this)
        setContentView(webView)
        webView.setBackgroundColor(0xFF0A0A0C.toInt())

        // پس‌زمینهٔ بازی تا زیر نوار وضعیت و نوار ناوبری ادامه پیدا کند تا ظاهر
        // یکدست بماند. روی همهٔ نسخه‌های اندروید یکسان رفتار می‌کند.
        WindowCompat.setDecorFitsSystemWindows(window, false)
        WindowCompat.getInsetsController(window, webView)
            .isAppearanceLightStatusBars = false     // آیکن‌های نوار وضعیت روشن

        // ⚠️ عمداً به وب‌ویو padding نمی‌دهیم؛ اگر بدهیم صفحه کوچک می‌شود،
        // نوار خالی می‌سازد و نسبت تصویر عوض می‌شود. به‌جایش وب‌ویو تمام‌صفحه
        // می‌ماند و فقط اندازهٔ نوارها را به بازی می‌دهیم تا خودش رعایت کند.
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
            allowFileAccess = true          // برای انتخاب عکس روی گوشی‌های قدیمی
            allowContentAccess = true
            useWideViewPort = true
            loadWithOverviewMode = true

            // ⚠️ مهم: وب‌ویو به‌طور پیش‌فرض از «اندازهٔ فونت» تنظیماتِ گوشی
            // پیروی می‌کند. اگر کاربر فونت گوشی را بزرگ کرده باشد، متن‌های
            // بازی بزرگ می‌شوند ولی کادرها ثابت می‌مانند و ظاهر به هم می‌ریزد.
            textZoom = 100

            // بازی نباید با دو انگشت زوم شود؛ چیدمانش خراب می‌شود.
            setSupportZoom(false)
            builtInZoomControls = false
            displayZoomControls = false

            cacheMode = WebSettings.LOAD_DEFAULT
            // ارتباط با سرور بازی روی http (سرور ایرانی، بدون TLS)
            mixedContentMode = WebSettings.MIXED_CONTENT_ALWAYS_ALLOW
        }

        // کشیده‌شدن و نوار اسکرول، در یک بازی تمام‌صفحه معنی ندارد
        webView.overScrollMode = View.OVER_SCROLL_NEVER
        webView.isVerticalScrollBarEnabled = false
        webView.isHorizontalScrollBarEnabled = false

        // روش رسمی گوگل: فایل‌های داخل پوشهٔ assets مثل یک سایت محلیِ امن
        // سرو می‌شوند. آدرس /assets/ به پوشهٔ app/src/main/assets نگاشت می‌شود.
        val assetLoader = WebViewAssetLoader.Builder()
            .addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(this))
            .build()

        webView.webViewClient = object : WebViewClient() {

            override fun shouldInterceptRequest(
                view: WebView,
                request: WebResourceRequest
            ): WebResourceResponse? = assetLoader.shouldInterceptRequest(request.url)

            // هر آدرسی جز خود بازی، در مرورگر گوشی باز شود نه داخل بازی
            override fun shouldOverrideUrlLoading(
                view: WebView,
                request: WebResourceRequest
            ): Boolean {
                val url = request.url
                if (url.host == "appassets.androidplatform.net") return false
                return try {
                    startActivity(Intent(Intent.ACTION_VIEW, url))
                    true
                } catch (e: Exception) {
                    true    // اگر مرورگری نبود، دست‌کم بازی را ترک نکن
                }
            }

            // همان کار، برای اندروید ۵ و ۶ که نسخهٔ بالایی را صدا نمی‌زنند
            @Suppress("DEPRECATION")
            override fun shouldOverrideUrlLoading(view: WebView, url: String): Boolean {
                if (url.startsWith("https://appassets.androidplatform.net")) return false
                return try {
                    startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url)))
                    true
                } catch (e: Exception) {
                    true
                }
            }

            override fun onPageFinished(view: WebView, url: String) {
                pushInsetsToGame()      // بعد از هر بار بارگذاری دوباره اعلام شود
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
                request.deny()      // بازی به دوربین و میکروفون نیازی ندارد
            }
        }

        webView.addJavascriptInterface(JsBridge(), "AndroidApp")

        webView.loadUrl(GAME_URL)

        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                webView.evaluateJavascript(
                    "(window.appBack ? window.appBack() : 'exit')"
                ) { v ->
                    if (v != null && v.contains("exit")) finish()
                }
            }
        })
    }

    /** پلی که بازی از داخل جاوااسکریپت صدا می‌زند.
     *  ⚠️ این کلاس باید public بماند؛ اندروید متدهایش را با reflection صدا
     *  می‌زند و اگر private باشد، روی بعضی گوشی‌ها کار نمی‌کند. */
    inner class JsBridge {

        @android.webkit.JavascriptInterface
        fun exit() {
            runOnUiThread { finish() }
        }

        /** باز کردن صفحهٔ برنامه در مایکت (برای به‌روزرسانی اجباری) */
        @android.webkit.JavascriptInterface
        fun openMarket(pkg: String) {
            val id = pkg.replace("[^A-Za-z0-9._]".toRegex(), "")
            if (id.isEmpty()) return
            runOnUiThread {
                // اول خودِ اپ مایکت
                try {
                    startActivity(
                        Intent(Intent.ACTION_VIEW, Uri.parse("myket://details?id=$id"))
                            .setPackage("ir.mservices.market")
                    )
                    return@runOnUiThread
                } catch (e: Exception) { /* مایکت نصب نیست */ }
                // اگر نبود، در مرورگر
                try {
                    startActivity(Intent(Intent.ACTION_VIEW, Uri.parse("https://myket.ir/app/$id")))
                } catch (e2: Exception) {
                    Toast.makeText(this@MainActivity, "مایکت روی گوشی پیدا نشد",
                        Toast.LENGTH_LONG).show()
                }
            }
        }
    }

    /** اندازهٔ نوارهای سیستم را به‌صورت متغیر CSS به بازی می‌دهد */
    private fun pushInsetsToGame() {
        if (!this::webView.isInitialized) return
        val js = StringBuilder()
            .append("document.documentElement.style.setProperty('--sat','").append(insTop).append("px');")
            .append("document.documentElement.style.setProperty('--sab','").append(insBottom).append("px');")
            .append("document.documentElement.style.setProperty('--sal','").append(insLeft).append("px');")
            .append("document.documentElement.style.setProperty('--sar','").append(insRight).append("px');")
        // فقط وقتی واقعاً اندازه‌ها را گرفته‌ایم به بازی بگو «حساب شد»
        if (haveInsets) js.append("window.__insetsOK=1;")
        try { webView.evaluateJavascript(js.toString(), null) } catch (e: Exception) {}
    }

    override fun onPause() {
        super.onPause()
        webView.onPause()
        webView.pauseTimers()       // وقتی بازی در پس‌زمینه است باتری نخورد
    }

    override fun onResume() {
        super.onResume()
        webView.resumeTimers()
        webView.onResume()
    }

    override fun onDestroy() {
        filePathCallback?.onReceiveValue(null)
        filePathCallback = null
        webView.stopLoading()
        webView.removeJavascriptInterface("AndroidApp")
        (webView.parent as? ViewGroup)?.removeView(webView)
        webView.destroy()
        super.onDestroy()
    }
}
