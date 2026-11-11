# Kotlin / coroutines reflection and serialization runtime metadata.
-dontwarn kotlinx.coroutines.**
-keepattributes *Annotation*, InnerClasses, Signature, Exceptions

# Ktor + OkHttp are used by mobile-core through public APIs.
-dontwarn org.slf4j.**
-dontwarn io.ktor.**
-keep class io.ktor.** { *; }
-keepclassmembers class io.ktor.** { *; }

# Compose runtime keeps composables reachable through generated code; preserve reflection entry points.
-keep class androidx.compose.runtime.** { *; }
-dontwarn androidx.compose.**

# Kotlin serialization generated serializers.
-keepattributes RuntimeVisibleAnnotations,AnnotationDefault
-keepclassmembers class **$$serializer { *; }
-keepclasseswithmembers class * {
    kotlinx.serialization.KSerializer serializer(...);
}

# AndroidX lifecycle / activity reflection.
-keep class androidx.lifecycle.** { *; }
-dontwarn androidx.lifecycle.**
