// ============================================================
//  محتوای فایل:  app/build.gradle.kts
//  (نه فایل build.gradle.kts که در ریشهٔ پروژه است)
// ============================================================
plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    // این نام باید دقیقاً همانی باشد که در پنل مایکت ثبت کرده‌اید
    namespace = "ir.smrx.pasur11"
    compileSdk = 35

    defaultConfig {
        applicationId = "ir.smrx.pasur11"
        minSdk = 21
        targetSdk = 35
        versionCode = 1
        versionName = "1.0"

        // ---- تنظیمات مایکت: این سه خط را دست نزنید ----
        val marketApplicationId = "ir.mservices.market"
        manifestPlaceholders["marketApplicationId"] = marketApplicationId
        manifestPlaceholders["marketBindAddress"] = "ir.mservices.market.InAppBillingService.BIND"
        manifestPlaceholders["marketPermission"] = "$marketApplicationId.BILLING"
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
    implementation("androidx.appcompat:appcompat:1.7.0")
    implementation("androidx.webkit:webkit:1.12.1")
    implementation("androidx.activity:activity-ktx:1.9.3")

    // کتابخانهٔ خرید درون‌برنامه‌ای (مایکت و کافه‌بازار)
    implementation("com.github.farasource:billing-client:1.4.0")
}
