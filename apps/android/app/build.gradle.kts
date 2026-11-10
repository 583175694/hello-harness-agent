plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
    alias(libs.plugins.kotlin.compose)
    alias(libs.plugins.paparazzi)
}

import java.util.Properties

val contractRoot = rootProject.projectDir.parentFile.parentFile.resolve("packages/mobile-contract")
val releaseKeystoreProperties = rootProject.file("keystore.properties")

android {
    namespace = "com.harness.agent"
    compileSdk = 36

    defaultConfig {
        applicationId = "com.harness.agent"
        minSdk = 26
        targetSdk = 36
        versionCode = 1
        versionName = "0.1.0"
    }

    flavorDimensions += "mode"
    productFlavors {
        create("preview") {
            dimension = "mode"
            isDefault = true
            buildConfigField("boolean", "USE_PREVIEW_PORT", "true")
        }
        create("production") {
            dimension = "mode"
            buildConfigField("boolean", "USE_PREVIEW_PORT", "false")
        }
    }

    signingConfigs {
        create("release") {
            val properties = Properties()
            if (releaseKeystoreProperties.isFile) {
                releaseKeystoreProperties.inputStream().use { input -> properties.load(input) }
            }
            val storeFileValue =
                properties.getProperty("storeFile")?.trim().orEmpty()
                    .ifEmpty { System.getenv("ANDROID_KEYSTORE_PATH")?.trim().orEmpty() }
            if (storeFileValue.isNotEmpty()) {
                storeFile = rootProject.file(storeFileValue)
                storePassword = properties.getProperty("storePassword", System.getenv("ANDROID_KEYSTORE_PASSWORD"))
                keyAlias = properties.getProperty("keyAlias", System.getenv("ANDROID_KEY_ALIAS"))
                keyPassword = properties.getProperty("keyPassword", System.getenv("ANDROID_KEY_PASSWORD"))
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro",
            )
            val releaseSigning = signingConfigs.getByName("release")
            signingConfig = if (releaseSigning.storeFile != null) releaseSigning else null
        }
        debug {
            isDebuggable = true
        }
        create("benchmark") {
            initWith(getByName("release"))
            isDebuggable = true
            signingConfig = signingConfigs.getByName("debug")
            matchingFallbacks += listOf("release")
            isMinifyEnabled = false
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }

    buildFeatures {
        compose = true
        buildConfig = true
    }

    testOptions {
        unitTests.isIncludeAndroidResources = true
    }
}

/** Gate A / preview flavor 专用；production 包不合并 `src/preview/assets`。 */
val syncMobileContractFixtures by tasks.registering(Copy::class) {
    from(contractRoot.resolve("fixtures/preview"))
    into(layout.projectDirectory.dir("src/preview/assets/mobile-contract/fixtures/preview"))
}

val syncMobileContractTokens by tasks.registering(Copy::class) {
    from(contractRoot.resolve("design-tokens.json"))
    into(layout.projectDirectory.dir("src/preview/assets/mobile-contract"))
}

tasks.named("preBuild") {
    dependsOn(syncMobileContractFixtures, syncMobileContractTokens)
}

dependencies {
    implementation("com.harness.mobile.core:core-api")
    "productionImplementation"("com.harness.mobile.core:core-engine")
    "productionImplementation"("com.harness.mobile.core:core-auth")
    "productionImplementation"("com.harness.mobile.core:core-data")
    implementation(project(":core-ui"))
    implementation(platform(libs.androidx.compose.bom))
    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.activity.compose)
    implementation(libs.androidx.lifecycle.runtime.ktx)
    implementation(libs.androidx.lifecycle.viewmodel.compose)
    implementation(libs.androidx.navigation.compose)
    implementation(libs.androidx.compose.ui)
    implementation(libs.androidx.compose.ui.tooling.preview)
    implementation(libs.androidx.compose.material3)
    implementation("androidx.compose.material:material-icons-extended")
    implementation("io.coil-kt:coil-compose:2.7.0")
    debugImplementation(libs.androidx.compose.ui.tooling)
}
