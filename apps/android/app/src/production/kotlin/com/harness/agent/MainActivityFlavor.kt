package com.harness.agent

import androidx.activity.ComponentActivity
import androidx.lifecycle.lifecycleScope
import com.harness.agent.auth.ProductionAccountActions
import com.harness.agent.auth.ProductionLoginCoordinator
import com.harness.agent.di.AgentSessionPortModule
import com.harness.agent.port.AgentSessionPort
import com.harness.agent.preview.PreviewAppPreferences
import com.harness.agent.settings.MemorySettingsBackend
import com.harness.agent.settings.McpSettingsBackend
import com.harness.agent.settings.ProductionMemorySettingsBackend
import com.harness.agent.settings.ProductionMcpSettingsBackend
import com.harness.agent.media.HarnessImageAuth
import com.harness.agent.ui.settings.LoginCoordinator
import com.harness.mobile.core.auth.cookieHeader
import kotlinx.coroutines.launch

object MainActivityFlavor {
    fun imageAuth(preferences: PreviewAppPreferences): HarnessImageAuth {
        val services = AgentSessionPortModule.coreServicesOrNull()
        return HarnessImageAuth(
            apiBaseUrl = { preferences.apiBaseUrl },
            sessionCookieHeader = { services?.tokenStore?.cookieHeader() },
        )
    }

    fun loginCoordinator(): LoginCoordinator {
        val services =
            AgentSessionPortModule.coreServicesOrNull()
                ?: error("CoreServices not initialized")
        return ProductionLoginCoordinator(services)
    }

    fun memorySettingsBackend(preferences: PreviewAppPreferences): MemorySettingsBackend {
        val services =
            AgentSessionPortModule.coreServicesOrNull()
                ?: error("CoreServices not initialized")
        return ProductionMemorySettingsBackend(services)
    }

    fun mcpSettingsBackend(preferences: PreviewAppPreferences): McpSettingsBackend {
        val services =
            AgentSessionPortModule.coreServicesOrNull()
                ?: error("CoreServices not initialized")
        return ProductionMcpSettingsBackend(services)
    }

    fun signOut(
        activity: ComponentActivity,
        preferences: PreviewAppPreferences,
        port: AgentSessionPort,
        onComplete: () -> Unit,
    ) {
        val services = AgentSessionPortModule.coreServicesOrNull() ?: run {
            preferences.updateAuthProfile(null)
            onComplete()
            return
        }
        activity.lifecycleScope.launch {
            ProductionAccountActions.signOut(services, preferences)
            port.resetForAuthChange()
            onComplete()
        }
    }
}
