package com.harness.mobile.core.auth

/** B0 占位；iOS Core 联调时接 Keychain。 */
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
