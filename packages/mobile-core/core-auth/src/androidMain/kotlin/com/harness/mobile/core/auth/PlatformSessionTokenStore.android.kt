package com.harness.mobile.core.auth

import android.content.Context

actual class PlatformSessionTokenStore actual constructor(platformContext: Any) {
    private val appContext: Context =
        (platformContext as Context).applicationContext
    private val prefs =
        appContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

    actual fun getToken(): String? = prefs.getString(KEY_TOKEN, null)?.trim()?.ifEmpty { null }

    actual fun setToken(token: String?) {
        prefs.edit().apply {
            if (token.isNullOrBlank()) {
                remove(KEY_TOKEN)
            } else {
                putString(KEY_TOKEN, token.trim())
            }
        }.apply()
    }

    actual fun clearToken() {
        prefs.edit().remove(KEY_TOKEN).apply()
    }

    private companion object {
        const val PREFS_NAME = "harness_core_auth"
        const val KEY_TOKEN = "session_token_v1"
    }
}
