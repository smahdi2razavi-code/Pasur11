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
        // ناوبری کشیده می‌شود (edge-to-edge). بدون این کد، کارت‌های پایین
        // بازی زیر نوار ناوبری می‌روند و بریده دیده می‌شوند.
        // اینجا به‌اندازهٔ نوارهای سیستم (و بریدگی دوربین) فاصله می‌گذاریم،
        // و وقتی صفحه‌کلید باز شود، پایین صفحه به‌اندازهٔ آن جمع می‌شود.
        ViewCompat.setOnApplyWindowInsetsListener(webView) { v, insets ->
            val bars = insets.getInsets(
                WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout()
            )
            val ime = insets.getInsets(WindowInsetsCompat.Type.ime())
            v.setPadding(bars.left, bars.top, bars.right, maxOf(bars.bottom, ime.bottom))
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

            // باز کردن برنامهٔ ایمیل از داخل بازی (صفحهٔ ارتباط با ما)
            @android.webkit.JavascriptInterface
            fun sendMail(to: String, subject: String, body: String) {
                runOnUiThread {
                    try {
                        val i = android.content.Intent(android.content.Intent.ACTION_SENDTO).apply {
                            data = Uri.parse("mailto:$to")
                            putExtra(android.content.Intent.EXTRA_SUBJECT, subject)
                            putExtra(android.content.Intent.EXTRA_TEXT, body)
                        }
                        startActivity(android.content.Intent.createChooser(i, "ارسال ایمیل"))
                    } catch (e: Exception) {
                        android.widget.Toast.makeText(
                            this@MainActivity, "برنامهٔ ایمیلی روی گوشی پیدا نشد", 
                            android.widget.Toast.LENGTH_LONG).show()
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

    override fun onDestroy() {
        (webView.parent as? ViewGroup)?.removeView(webView)
        webView.destroy()
        super.onDestroy()
    }
}
