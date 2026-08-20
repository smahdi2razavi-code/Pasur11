plugins {
    // ⚠️ اگر فایل فعلی‌ات به‌جای این دو خط، alias(libs.plugins...) دارد،
    //    همان بلوک plugins خودت را نگه دار و فقط بقیهٔ فایل را عوض کن.
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    // نام بستهٔ کد — باید با خط package در MainActivity.kt یکی باشد
    namespace = "com.yourname.pasur11"
    compileSdk = 35

    defaultConfig {
        // نام بستهٔ فروشگاه — همان که در مایکت ثبت شده
        applicationId = "com.smahdi2razavi.pasur11"
        minSdk = 21
        targetSdk = 35
        versionCode = 5
        versionName = "1.1"

        // لازم برای کتابخانهٔ پرداخت مایکت
        manifestPlaceholders += mapOf(
            "marketApplicationId" to "ir.mservices.market",
            "marketBindAddress" to "ir.mservices.market.InAppBillingService.BIND",
            "marketPermission" to "ir.mservices.market.BILLING"
        )
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions {
        jvmTarget = "17"
    }
}

dependencies {
    implementation("androidx.core:core-ktx:1.13.1")
    implementation("androidx.activity:activity-ktx:1.9.3")
    implementation("androidx.webkit:webkit:1.11.0")
    implementation("com.github.myketstore:myket-billing-client:1.19")
}
