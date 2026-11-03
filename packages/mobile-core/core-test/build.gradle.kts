plugins {
    alias(libs.plugins.kotlin.multiplatform)
}

kotlin {
    jvm()

    sourceSets {
        val commonTest by getting {
            dependencies {
                implementation(kotlin("test"))
                implementation(project(":core-api"))
                implementation(project(":core-engine"))
                implementation(libs.kotlinx.coroutines.core)
                implementation(libs.kotlinx.serialization.json)
            }
        }
    }
}

tasks.named<Test>("jvmTest") {
    val contractRoot = rootProject.projectDir.parentFile.resolve("mobile-contract")
    systemProperty("harness.mobileContractRoot", contractRoot.absolutePath)
}
