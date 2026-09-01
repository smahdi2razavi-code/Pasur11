// ============================================================
//  محتوای فایل:  settings.gradle.kts  (در ریشهٔ پروژه)
//  فقط خط  maven(url = "https://jitpack.io")  را اضافه کرده‌ایم
// ============================================================
pluginManagement {
    repositories {
        google()
        mavenCentral()
        gradlePluginPortal()
    }
}
dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        google()
        mavenCentral()
        maven(url = "https://jitpack.io")     // ← این خط برای کتابخانهٔ خرید لازم است
    }
}

rootProject.name = "Pasur11"
include(":app")
