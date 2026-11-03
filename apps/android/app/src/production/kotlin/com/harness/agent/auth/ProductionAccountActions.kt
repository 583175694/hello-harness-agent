package com.harness.agent.auth

import com.harness.agent.core.CoreServices
import com.harness.agent.preview.PreviewAppPreferences

object ProductionAccountActions {
    suspend fun signOut(
        services: CoreServices,
        preferences: PreviewAppPreferences,
    ) {
        runCatching { services.authClient().logout() }
        services.tokenStore.clearToken()
        preferences.updateAuthProfile(null)
    }
}
