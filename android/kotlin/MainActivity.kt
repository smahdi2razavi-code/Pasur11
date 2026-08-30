package ir.smrx.pasur11

import android.annotation.SuppressLint
import android.os.Build
import android.os.Bundle
import android.view.ViewGroup
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.OnBackPressedCallback
import androidx.appcompat.app.AppCompatActivity
import androidx.webkit.WebViewAssetLoader
import java.io.File
import java.io.FileOutputStream
import java.net.HttpURLConnection
import java.net.URL

/**
 * پوستهٔ اندرویدی بازی «پاسور ۱۱».
 *
 * چطور کار می‌کند:
 *   • بازی همیشه از داخل خود برنامه اجرا می‌شود، پس بدون اینترنت هم بالا می‌آید.
 *   • در پس‌زمینه، آخرین نسخهٔ بازی از اینترنت گرفته و ذخیره می‌شود؛ دفعهٔ بعد
 *     که کاربر برنامه را باز کند، نسخهٔ جدید را می‌بیند — بدون نیاز به آپدیت APK.
 *   • آدرس همیشه یکی است (appassets.androidplatform.net)، پس سکه، اشتراک VIP و
 *     پیشرفت کاربر هیچ‌وقت گم نمی‌شود. (اگر گاهی از فایل و گاهی از اینترنت
 *     می‌خواندیم، حافظهٔ بازی دو تکه می‌شد و کاربر فکر می‌کرد سکه‌هایش پریده.)
 *
 * تنها چیزی که ممکن است بخواهید عوض کنید، دو خط زیر (UPDATE_URL) است.
 */
class MainActivity : AppCompatActivity() {

    companion object {
        /**
         * آدرس اینترنتی فایل index.html بازی، برای به‌روزرسانی خودکار.
         *
         * تا وقتی نسخهٔ جدید بازی را روی همان آدرس نگذاشته‌اید، این را
         * خالی ("") بگذارید. وگرنه برنامه نسخهٔ قدیمی اینترنتی را دانلود
         * می‌کند و می‌خواهد بازیِ داخل برنامه را با آن عوض کند.
         *
         * (کد پایین محافظ هم دارد: نسخه‌ای با شمارهٔ کوچک‌تر هرگز جایگزین
         * نمی‌شود. ولی خالی گذاشتن، مطمئن‌ترین کار است.)
         */
        private const val UPDATE_URL = ""

        private const val DOMAIN = "appassets.androidplatform.net"
        private const val START_URL = "https://$DOMAIN/game/index.html"

        /** فایل‌هایی که بار اول از داخل برنامه در حافظهٔ گوشی کپی می‌شوند */
        private val BUNDLED = arrayOf("index.html", "manifest.json", "icon-192.png", "icon-512.png", "sw.js")
    }

    private lateinit var web: WebView
    private var bridge: MyketBridge? = null

    /** پوشه‌ای در حافظهٔ داخلی که نسخهٔ فعلی بازی در آن نگه داشته می‌شود */
    private val gameDir: File by lazy { File(filesDir, "game").apply { mkdirs() } }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        prepareGameFiles()

        web = WebView(this)
        web.layoutParams = ViewGroup.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.MATCH_PARENT
        )
        setContentView(web)

        val settings: WebSettings = web.settings
        settings.javaScriptEnabled = true
        settings.domStorageEnabled = true              // برای ذخیرهٔ پیشرفت و سکه‌های بازی
        settings.databaseEnabled = true
        settings.mediaPlaybackRequiresUserGesture = false   // تا صدای بازی پخش شود
        settings.loadWithOverviewMode = true
        settings.useWideViewPort = true
        settings.setSupportZoom(false)
        settings.builtInZoomControls = false
        settings.cacheMode = WebSettings.LOAD_DEFAULT
        settings.allowFileAccess = false
        settings.allowContentAccess = false
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            settings.mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
        }
        WebView.setWebContentsDebuggingEnabled(false)

        // فایل‌های بازی از حافظهٔ داخلی روی یک آدرس https معتبر سرو می‌شوند
        val loader = WebViewAssetLoader.Builder()
            .setDomain(DOMAIN)
            .addPathHandler("/game/", WebViewAssetLoader.InternalStoragePathHandler(this, gameDir))
            .build()

        web.webViewClient = object : WebViewClient() {
            override fun shouldInterceptRequest(
                view: WebView, request: WebResourceRequest
            ): WebResourceResponse? = loader.shouldInterceptRequest(request.url)

            override fun shouldOverrideUrlLoading(
                view: WebView, request: WebResourceRequest
            ): Boolean {
                // لینک‌های بیرونی (اشتراک‌گذاری و…) در مرورگر باز شوند، نه داخل بازی
                val url = request.url
                if (url.host == DOMAIN) return false
                return try {
                    startActivity(android.content.Intent(android.content.Intent.ACTION_VIEW, url))
                    true
                } catch (e: Exception) { true }
            }
        }

        // پل خرید مایکت — نام MyketBilling باید دقیقاً همین باشد
        bridge = MyketBridge(this, web, activityResultRegistry)
        web.addJavascriptInterface(bridge!!, "MyketBilling")

        web.loadUrl(START_URL)

        // دکمهٔ برگشت گوشی به خود بازی سپرده می‌شود (بازی مودال «خروج؟» دارد)
        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                if (web.canGoBack()) web.goBack() else finish()
            }
        })

        // گرفتن نسخهٔ جدید بازی در پس‌زمینه (برای دفعهٔ بعد)
        downloadUpdateInBackground()
    }

    override fun onDestroy() {
        bridge?.release()
        try { web.destroy() } catch (e: Exception) { }
        super.onDestroy()
    }

    // ------------------------------------------------------------------

    /** بار اول، فایل‌های بازی از داخل برنامه در حافظهٔ گوشی کپی می‌شوند */
    private fun prepareGameFiles() {
        val marker = File(gameDir, "index.html")
        if (marker.exists()) return
        for (name in BUNDLED) {
            try {
                assets.open("game/$name").use { input ->
                    FileOutputStream(File(gameDir, name)).use { output ->
                        input.copyTo(output)
                    }
                }
            } catch (e: Exception) {
                // اگر فایلی نبود اشکالی ندارد؛ فقط index.html ضروری است
            }
        }
    }

    /**
     * آخرین index.html را از اینترنت می‌گیرد و ذخیره می‌کند.
     * اگر اینترنت نبود یا هر خطایی رخ داد، بی‌سروصدا رد می‌شود و بازی
     * با همان نسخهٔ فعلی ادامه می‌دهد.
     */
    private fun downloadUpdateInBackground() {
        if (UPDATE_URL.isEmpty()) return
        Thread {
            var conn: HttpURLConnection? = null
            try {
                conn = (URL(UPDATE_URL).openConnection() as HttpURLConnection).apply {
                    connectTimeout = 12000
                    readTimeout = 20000
                    requestMethod = "GET"
                    instanceFollowRedirects = true
                }
                if (conn.responseCode != 200) return@Thread
                val body = conn.inputStream.bufferedReader().use { it.readText() }

                // بررسی سلامت: باید یک صفحهٔ کامل بازی باشد، نه صفحهٔ خطا
                if (body.length < 20000 || !body.contains("پاسور")) return@Thread

                val dest = File(gameDir, "index.html")
                val current = if (dest.exists()) dest.readText() else ""
                if (current == body) return@Thread

                // فقط نسخهٔ جدیدتر پذیرفته می‌شود؛ اگر روی سایت هنوز نسخهٔ
                // قدیمی مانده باشد، بازیِ داخل برنامه دست‌نخورده می‌ماند.
                if (versionOf(body) < versionOf(current)) return@Thread

                val tmp = File(gameDir, "index.html.tmp")
                tmp.writeText(body)
                if (!tmp.renameTo(dest)) { tmp.copyTo(dest, overwrite = true); tmp.delete() }
            } catch (e: Exception) {
                // بدون اینترنت یا خطای شبکه: نادیده گرفته می‌شود
            } finally {
                try { conn?.disconnect() } catch (e: Exception) { }
            }
        }.start()
    }

    /**
     * شمارهٔ نسخه را از تگ  <meta name="game-version" content="N">  می‌خواند.
     * اگر تگ نبود (نسخه‌های قدیمی بازی) عدد صفر برمی‌گردد.
     */
    private fun versionOf(html: String): Int {
        if (html.isEmpty()) return 0
        val key = html.indexOf("game-version")
        if (key < 0) return 0
        val at = html.indexOf("content", key)
        if (at < 0 || at - key > 80) return 0
        val digits = StringBuilder()
        var i = at
        while (i < html.length && i < at + 40) {
            val ch = html[i]
            if (ch.isDigit()) digits.append(ch)
            else if (digits.isNotEmpty()) break
            else if (ch == '>') break
            i++
        }
        return digits.toString().toIntOrNull() ?: 0
    }
}
