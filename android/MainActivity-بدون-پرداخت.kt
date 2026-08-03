/* ============================================================================
 *  MainActivity.kt  —  نسخهٔ ساده (فقط حل مشکل آپدیت) — روش WebViewAssetLoader
 *  این نسخه هیچ کد پرداختی ندارد و فایل‌های بازی را با روش رسمی گوگل از داخل
 *  اپ سرو می‌کند (مثل یک سایت محلیِ امن). خطای ERR_FILE_NOT_FOUND در گوشی‌های
 *  سامسونگ و سایر گوشی‌ها با این روش دیگر پیش نمی‌آید.
 *
 *  ⚠ پیش‌نیاز: در build.gradle.kts این خط را در بخش dependencies اضافه کن:
 *        implementation("androidx.webkit:webkit:1.11.0")
 *     و بعد روی «Sync Now» بزن.
 * ========================================================================== */

package com.yourname.pasur11

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
import androidx.activity.OnBackPressedCallback
import androidx.activity.result.ActivityResultLauncher
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.webkit.WebViewAssetLoader

class MainActivity : AppCompatActivity() {

    private lateinit var webView: WebView

    private var filePathCallback: ValueCallback<Array<Uri>>? = null
    private lateinit var fileChooser: ActivityResultLauncher<android.content.Intent>

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

        webView.addJavascriptInterface(object {
            @android.webkit.JavascriptInterface
            fun exit() { runOnUiThread { finish() } }
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
