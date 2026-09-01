# قرارداد پل خرید مایکت (اپلیکیشن اندروید ↔ بازی)

> 📄 **اگر می‌خواهید فقط اپلیکیشن را بسازید، این فایل را لازم ندارید.**
> راهنمای قدم‌به‌قدم در [`README-FA.md`](README-FA.md) است و کد آمادهٔ
> کاتلین در پوشهٔ [`kotlin/`](kotlin/) قرار دارد.
> این فایل توضیح فنی قرارداد است، برای وقتی که بخواهید پل را خودتان
> از نو بنویسید یا با ابزار دیگری (یونیتی، فلاتر، …) پیاده کنید.

بازی «پاسور ۱۱» یک صفحهٔ وب است. برای اینکه محصولات به **درگاه مایکت** وصل شوند،
اپلیکیشن اندرویدی (که بازی را داخل `WebView` نشان می‌دهد) باید یک شیء جاوااسکریپت
به نام `MyketBilling` به صفحه تزریق کند.

سمت وب **کاملاً آماده است** — به‌محض اینکه این شیء در صفحه وجود داشته باشد،
دکمه‌های «خرید» فعال می‌شوند، پرداخت شروع می‌شود، رسید برای سرور فرستاده و
امضایش بررسی می‌شود و جایزه اعمال می‌گردد. تا وقتی این شیء نباشد، بازی به کاربر
می‌گوید «خرید فقط در نسخهٔ نصب‌شده از مایکت انجام می‌شود» و هیچ چیز رایگان
نمی‌دهد.

---

## ۱. توابعی که اپلیکیشن باید فراهم کند

شیء با نام `MyketBilling` تزریق می‌شود (نام‌های `AndroidBilling` و `MyketIAB`
هم پذیرفته می‌شوند):

```java
webView.addJavascriptInterface(new MyketBridge(this), "MyketBilling");
```

| تابع | امضا | کار |
|---|---|---|
| `buy` | `buy(String sku, String payload)` | شروع خرید؛ `payload` رشتهٔ JSON شناسهٔ دستگاه است و باید عیناً به‌عنوان `developerPayload` به مایکت داده شود |
| `restore` | `restore()` | خواندن فهرست خریدهای قبلی کاربر (`getPurchases`) |
| `consume` | `consume(String purchaseToken)` | مصرف بستهٔ سکه تا دوباره قابل خرید شود |

`buy` و `restore` و `consume` هیچ مقداری برنمی‌گردانند؛ نتیجه از راه توابع
زیر به صفحه برمی‌گردد.

## ۲. توابعی که اپلیکیشن باید صدا بزند

هر سه تابع روی `window` تعریف شده‌اند و از رشتهٔ ساده هم پشتیبانی می‌کنند.
از ترد اصلی و با `webView.evaluateJavascript(...)` صدایشان بزنید.

### خرید موفق
```java
String js = "window.onMyketPurchase(" + jsonString + ")";
```
که `jsonString` این شکل است:
```json
{
  "sku": "coins_1500",
  "purchaseData": "{\"orderId\":\"...\",\"productId\":\"coins_1500\",\"purchaseState\":0,\"purchaseToken\":\"...\"}",
  "signature": "امضای base64 که مایکت برگردانده",
  "purchaseToken": "..."
}
```
> `purchaseData` باید **همان رشتهٔ خامی** باشد که مایکت در
> `INAPP_PURCHASE_DATA` داده — حتی یک فاصله هم نباید تغییر کند، وگرنه
> بررسی امضا روی سرور رد می‌شود.

سه رشتهٔ جدا هم پذیرفته است:
```java
"window.onMyketPurchase('coins_1500', " + q(purchaseData) + ", " + q(signature) + ")"
```

### بازیابی خریدهای قبلی
```java
"window.onMyketRestore(" + jsonArrayString + ")"
```
آرایه‌ای از همان شیءهای بالا.

### خطا یا لغو
```java
"window.onMyketError('user canceled', 'coins_1500')"
```
اگر متن پیام شامل `cancel` باشد، بازی فقط می‌گوید «خرید لغو شد».
اگر شامل `already` یا `owned` باشد، بازی خودش `restore` را صدا می‌زند.

### آماده شدن دیرهنگام
اگر پل بعد از بارگذاری صفحه تزریق شد، این را هم بفرستید تا فروشگاه دوباره
رندر شود:
```java
"window.dispatchEvent(new Event('myket-ready'))"
```

---

## ۳. مسیر کامل یک خرید

```
کاربر «خرید» را می‌زند
        ↓
iapBuy(sku)  →  MyketBilling.buy(sku, payload)
        ↓
پنجرهٔ پرداخت مایکت
        ↓
window.onMyketPurchase({sku, purchaseData, signature})
        ↓
خرید در حافظهٔ گوشی صف می‌شود (اگر برنامه بسته شود گم نمی‌شود)
        ↓
POST https://<سرور شما>/api/iap/myket/verify
        ↓
سرور امضا را با کلید عمومی RSA مایکت بررسی می‌کند (SHA1withRSA)
        ↓
جایزه (سکه / روزهای VIP / بلیط) برگردانده و در بازی اعمال می‌شود
        ↓
برای بسته‌های سکه: MyketBilling.consume(token)
```

اگر اینترنت نباشد، خرید در صف می‌ماند و با اولین اتصال، یا با باز شدن دوبارهٔ
برنامه، خودکار تأیید و اعمال می‌شود. خرید تکراری هرگز دو بار جایزه نمی‌دهد
(هم در گوشی و هم روی سرور با `orderId` کنترل می‌شود).

## ۴. نمونهٔ کلاس پل

```java
public class MyketBridge {
    private final Activity activity;          // اکتیویتی‌ای که WebView در آن است
    public MyketBridge(Activity a) { this.activity = a; }

    @JavascriptInterface
    public void buy(String sku, String payload) {
        activity.runOnUiThread(() -> IabHelper.launchPurchaseFlow(activity, sku, REQ, listener, payload));
    }

    @JavascriptInterface
    public void restore() {
        activity.runOnUiThread(() -> IabHelper.queryInventoryAsync(gotInventoryListener));
    }

    @JavascriptInterface
    public void consume(String purchaseToken) {
        activity.runOnUiThread(() -> IabHelper.consumeAsync(purchaseToken, null));
    }
}
```

در `onActivityResult` بعد از خرید موفق:

```java
String json = new JSONObject()
    .put("sku", purchase.getSku())
    .put("purchaseData", purchase.getOriginalJson())   // رشتهٔ خام
    .put("signature", purchase.getSignature())
    .put("purchaseToken", purchase.getToken())
    .toString();
webView.evaluateJavascript("window.onMyketPurchase(" + JSONObject.quote(json) + ")", null);
```

## ۵. نکات مهم

- **کلید عمومی را در APK نگذارید و همان‌جا امضا را بررسی نکنید.** بررسی امضا
  روی سرور انجام می‌شود (`server/server.js`) تا با دستکاری APK قابل دور زدن نباشد.
- شناسه‌های محصول در سه جا باید یکی باشند: پنل مایکت، `IAP_PRODUCTS` در
  `index.html` و `products` در `server/config.json`.
- **همهٔ شش محصول بعد از تأیید، مصرف (consume) می‌شوند** — از جمله اشتراک VIP.
  چون در پنل مایکت «محصول درون‌برنامه‌ای» هستند نه اشتراک واقعی، اگر مصرف
  نشوند هر کاربر فقط یک بار در عمرش می‌تواند VIP بخرد و تمدید ممکن نیست.
- `WebView` باید این‌ها را روشن داشته باشد:
  `javaScriptEnabled`، `domStorageEnabled` (برای ذخیرهٔ پیشرفت بازی) و
  `mediaPlaybackRequiresUserGesture = false` (برای صدا).
- در `AndroidManifest.xml` مجوز مایکت لازم است:
  `<uses-permission android:name="ir.mservices.market.BILLING" />`
