package com.harness.mobile.core.auth

/** 对齐 Web / RN：`harness_session` Cookie（45 §4.3）。 */
object SessionCookie {
    const val NAME = "harness_session"

    fun headerValue(token: String): String = "$NAME=${token.trim()}"

    fun cookieHeader(token: String?): String? {
        val t = token?.trim().orEmpty()
        if (t.isEmpty()) return null
        return headerValue(t)
    }
}

expect class PlatformSessionTokenStore(platformContext: Any) {
    fun getToken(): String?
    fun setToken(token: String?)
    fun clearToken()
}

fun PlatformSessionTokenStore.cookieHeader(): String? = SessionCookie.cookieHeader(getToken())
