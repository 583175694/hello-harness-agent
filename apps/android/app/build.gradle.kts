plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
    alias(libs.plugins.kotlin.compose)
    alias(libs.plugins.paparazzi)
}

val contractRoot = rootProject.projectDir.parentFile.parentFile.resolve("packages/mobile-contract")

android {
    namespace = "com.harness.agent"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.harness.agent"
        minSdk = 26
        targetSdk = 35
        versionCode = 1
        versionName = "0.1.0-preview"
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

    buildTypes {
        release {
            isMinifyEnabled = false
            // 本地真机可装 previewRelease（非 debuggable）；正式上架再换 release keystore
            signingConfig = signingConfigs.getByName("debug")
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

val syncMobileContractFixtures by tasks.registering(Copy::class) {
    from(contractRoot.resolve("fixtures/preview"))
    into(layout.projectDirectory.dir("src/main/assets/mobile-contract/fixtures/preview"))
}

val syncMobileContractTokens by tasks.registering(Copy::class) {
    from(contractRoot.resolve("design-tokens.json"))
    into(layout.projectDirectory.dir("src/main/assets/mobile-contract"))
}

tasks.named("preBuild") {
    dependsOn(syncMobileContractFixtures, syncMobileContractTokens)
}

dependencies {
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
    debugImplementation(libs.androidx.compose.ui.tooling)
}
