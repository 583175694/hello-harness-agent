package com.harness.agent

import androidx.activity.ComponentActivity
import com.harness.agent.auth.PreviewLoginCoordinator
import com.harness.agent.preview.PreviewAppPreferences
import com.harness.agent.settings.MemorySettingsBackend
import com.harness.agent.settings.McpSettingsBackend
import com.harness.agent.settings.PreviewMemorySettingsBackend
import com.harness.agent.settings.PreviewMcpSettingsBackend
import com.harness.agent.media.HarnessImageAuth
import com.harness.agent.port.AgentSessionPort
import com.harness.agent.ui.settings.LoginCoordinator

object MainActivityFlavor {
    fun imageAuth(preferences: PreviewAppPreferences): HarnessImageAuth = HarnessImageAuth()

    fun loginCoordinator(): LoginCoordinator = PreviewLoginCoordinator

    fun mcpSettingsBackend(preferences: PreviewAppPreferences): McpSettingsBackend =
        PreviewMcpSettingsBackend(preferences)

    fun memorySettingsBackend(preferences: PreviewAppPreferences): MemorySettingsBackend =
        PreviewMemorySettingsBackend(preferences)

    fun signOut(
        activity: ComponentActivity,
        preferences: PreviewAppPreferences,
        port: AgentSessionPort,
        onComplete: () -> Unit,
    ) {
        preferences.updateAuthProfile(null)
        onComplete()
    }
}
