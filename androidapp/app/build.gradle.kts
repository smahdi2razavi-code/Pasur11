plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "ir.smrx.pasur11"
    compileSdk = 35

    defaultConfig {
        applicationId = "ir.smrx.pasur11"
        minSdk = 21
        targetSdk = 35
        versionCode = 5  // باید با APP_VERSION_CODE در index.html یکی باشد
        versionName = "1.1"  // باید با APP_VERSION_NAME در index.html یکی باشد

        // ---------- تنظیمات درگاه مایکت ----------
        // این سه خط را دست نزنید؛ کتابخانهٔ خرید از روی همین‌ها مجوزها را
        // به AndroidManifest اضافه می‌کند.
        val marketApplicationId = "ir.mservices.market"
        manifestPlaceholders["marketApplicationId"] = marketApplicationId
        manifestPlaceholders["marketBindAddress"] = "ir.mservices.market.InAppBillingService.BIND"
        manifestPlaceholders["marketPermission"] = "$marketApplicationId.BILLING"
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions {
        jvmTarget = "17"
    }

    // فایل‌های بازی نباید فشرده شوند تا سریع باز شوند
    androidResources {
        noCompress += listOf("png")
    }
}

dependencies {
    implementation("androidx.appcompat:appcompat:1.7.0")
    implementation("androidx.core:core-ktx:1.15.0")
    implementation("androidx.activity:activity-ktx:1.9.3")
    implementation("androidx.webkit:webkit:1.12.1")

    // خرید درون‌برنامه‌ای مایکت
    implementation("com.github.farasource:billing-client:1.4.0")
}
