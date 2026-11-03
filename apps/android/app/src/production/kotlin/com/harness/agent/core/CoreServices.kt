package com.harness.agent.core

import android.content.Context
import com.harness.mobile.core.api.EngineConfig
import com.harness.mobile.core.auth.PlatformSessionTokenStore
import com.harness.mobile.core.auth.cookieHeader
import com.harness.mobile.core.data.HarnessAuthClient
import com.harness.agent.preview.PreviewAppPreferences

/** Production 单例依赖：Engine + Auth 共用 token 与 Base URL。 */
class CoreServices(
    context: Context,
    private val preferences: PreviewAppPreferences,
) {
    val tokenStore = PlatformSessionTokenStore(context.applicationContext)

    fun apiBaseUrl(): String = preferences.apiBaseUrl

    fun engineConfig(): EngineConfig =
        EngineConfig(
            apiBaseUrlProvider = { preferences.apiBaseUrl },
            getSessionCookieHeader = { tokenStore.cookieHeader() },
        )

    fun authClient(): HarnessAuthClient = HarnessAuthClient.create(engineConfig())
}
