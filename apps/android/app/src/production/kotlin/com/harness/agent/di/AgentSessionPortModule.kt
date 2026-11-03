package com.harness.agent.di

import android.content.Context
import com.harness.agent.core.CoreServices
import com.harness.agent.port.AgentSessionPort
import com.harness.agent.port.CoreAgentSessionPort
import com.harness.agent.preview.PreviewAppPreferences

object AgentSessionPortModule {
    private var coreServices: CoreServices? = null

    fun create(
        context: Context,
        preferences: PreviewAppPreferences,
    ): AgentSessionPort {
        val services = CoreServices(context, preferences)
        coreServices = services
        return CoreAgentSessionPort(services)
    }

    fun coreServicesOrNull(): CoreServices? = coreServices
}
