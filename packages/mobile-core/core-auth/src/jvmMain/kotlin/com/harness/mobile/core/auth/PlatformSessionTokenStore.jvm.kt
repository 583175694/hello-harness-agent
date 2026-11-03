package com.harness.mobile.core.auth

actual class PlatformSessionTokenStore actual constructor(platformContext: Any) {
    private var token: String? = null

    actual fun getToken(): String? = token

    actual fun setToken(token: String?) {
        this.token = token?.trim()?.ifEmpty { null }
    }

    actual fun clearToken() {
        token = null
    }
}
