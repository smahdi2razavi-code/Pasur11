/* ⚠️ خط «package» زیر باید دقیقاً با مقدار namespace در build.gradle.kts یکی باشد.
 *    اگر پروژهٔ تو نام دیگری دارد، همین یک خط را عوض کن.
 *
 *    ❗ نام بستهٔ فروشگاه (applicationId) چیز دیگری است و باید با نام بسته‌ای
 *    که در پنل مایکت ثبت کرده‌ای یکی باشد. آن را در build.gradle.kts تنظیم کن،
 *    نه اینجا. توضیح کامل: رفع-خطای-نام-بسته-مایکت.md
 */
package com.smahdi2razavi.pasur11

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
import androidx.activity.ComponentActivity
import androidx.activity.OnBackPressedCallback
import androidx.activity.result.ActivityResultLauncher
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import androidx.webkit.WebViewAssetLoader

class MainActivity : ComponentActivity() {

    private lateinit var webView: WebView

    private var filePathCallback: ValueCallback<Array<Uri>>? = null
    private lateinit var fileChooser: ActivityResultLauncher<android.content.Intent>

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

        // WebView را مستقیم در کد می‌سازیم؛ نیازی به فایل layout نیست
        webView = WebView(this)
        setContentView(webView)
        webView.setBackgroundColor(0xFF0A0A0C.toInt())

        // اندروید ۱۵ به بعد، پنجره به‌طور پیش‌فرض تا زیر نوار وضعیت و نوار
        // ناوبری کشیده می‌شود (edge-to-edge) و محتوا زیر ساعت و باتری می‌رود.
        // ⚠️ عمداً به وب‌ویو padding نمی‌دهیم؛ اگر بدهیم صفحه کوچک می‌شود،
        // نوارهای خالی می‌سازد و نسبت تصویر عوض می‌شود.
        // به‌جایش وب‌ویو تمام‌صفحه می‌ماند و فقط اندازهٔ نوارهای سیستم را به
        // بازی می‌دهیم تا خودش محتوا را کمی داخل‌تر بچیند. پس‌زمینهٔ بازی
        // تا زیر ساعت و نوار ناوبری ادامه پیدا می‌کند و ظاهر یکدست می‌ماند.
        ViewCompat.setOnApplyWindowInsetsListener(webView) { _, insets ->
            val bars = insets.getInsets(
                WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout()
            )
            val ime = insets.getInsets(WindowInsetsCompat.Type.ime())
            val d = resources.displayMetrics.density.coerceAtLeast(1f)
            sendInsets(
                (bars.top / d).toInt(),
                (maxOf(bars.bottom, ime.bottom) / d).toInt(),
                (bars.left / d).toInt(),
                (bars.right / d).toInt()
            )
            insets
        }
        // آیکن‌های نوار وضعیت روشن باشند تا روی پس‌زمینهٔ تیرهٔ بازی دیده شوند
        WindowInsetsControllerCompat(window, webView).isAppearanceLightStatusBars = false

        webView.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            databaseEnabled = true
            allowFileAccess = true
            allowContentAccess = true
            useWideViewPort = true
            loadWithOverviewMode = true
            cacheMode = WebSettings.LOAD_DEFAULT
            // اجازهٔ ارتباط با سرور بازی روی http (سرور ایرانی، بدون TLS تا
            // فیلترینگ در هندشیک اختلال ایجاد نکند). داده‌ها حساس نیستند.
            mixedContentMode = WebSettings.MIXED_CONTENT_ALWAYS_ALLOW
        }

        // روش رسمی گوگل: فایل‌های داخل assets را مثل یک سایت محلی امن سرو می‌کند
        val assetLoader = WebViewAssetLoader.Builder()
            .addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(this))
            .build()

        webView.webViewClient = object : WebViewClient() {
            override fun onPageFinished(view: WebView, url: String) {
                markInsetsHandled()          // بعد از هر بار بارگذاری دوباره اعلام شود
            }
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

        webView.addJavascriptInterface(object {
            @android.webkit.JavascriptInterface
            fun exit() { runOnUiThread { finish() } }

            // باز کردن صفحهٔ برنامه در مایکت (برای به‌روزرسانی اجباری)
            @android.webkit.JavascriptInterface
            fun openMarket(pkg: String) {
                runOnUiThread {
                    val id = pkg.replace("[^A-Za-z0-9._]".toRegex(), "")
                    try {
                        // اول خودِ اپ مایکت
                        startActivity(android.content.Intent(
                            android.content.Intent.ACTION_VIEW,
                            Uri.parse("myket://details?id=$id")
                        ).apply { setPackage("ir.mservices.market") })
                    } catch (e: Exception) {
                        try {
                            // اگر مایکت نصب نبود، در مرورگر
                            startActivity(android.content.Intent(
                                android.content.Intent.ACTION_VIEW,
                                Uri.parse("https://myket.ir/app/$id")
                            ))
                        } catch (e2: Exception) {
                            android.widget.Toast.makeText(
                                this@MainActivity, "مایکت روی گوشی پیدا نشد",
                                android.widget.Toast.LENGTH_LONG).show()
                        }
                    }
                }
            }
        }, "AndroidApp")

        // ✅ بازی از داخل خود اپ سرو می‌شود (آدرس محلیِ امن، نه اینترنت)
        webView.loadUrl("https://appassets.androidplatform.net/assets/index.html")

        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                webView.evaluateJavascript("window.appBack ? window.appBack() : 'exit'") { v ->
                    if (v != null && v.contains("exit")) finish()
                }
            }
        })
    }

    /** اندازهٔ نوارهای سیستم را به‌صورت متغیر CSS به بازی می‌دهد */
    private var insTop = 0
    private var insBottom = 0
    private var insLeft = 0
    private var insRight = 0

    private fun sendInsets(top: Int, bottom: Int, left: Int, right: Int) {
        insTop = top; insBottom = bottom; insLeft = left; insRight = right
        markInsetsHandled()
    }

    private fun markInsetsHandled() {
        val js = "document.documentElement.style.setProperty('--sat','" + insTop + "px');" +
                 "document.documentElement.style.setProperty('--sab','" + insBottom + "px');" +
                 "document.documentElement.style.setProperty('--sal','" + insLeft + "px');" +
                 "document.documentElement.style.setProperty('--sar','" + insRight + "px');" +
                 "window.__insetsOK=1;"
        try { webView.evaluateJavascript(js, null) } catch (e: Exception) {}
    }

    override fun onDestroy() {
        (webView.parent as? ViewGroup)?.removeView(webView)
        webView.destroy()
        super.onDestroy()
    }
}
