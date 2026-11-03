package com.harness.agent.di

import android.content.Context
import com.harness.agent.port.AgentSessionPort
import com.harness.agent.preview.MobileContractPreviewLoader
import com.harness.agent.preview.PreviewAgentSessionPort
import com.harness.agent.preview.PreviewAppPreferences

object AgentSessionPortModule {
    fun create(
        context: Context,
        preferences: PreviewAppPreferences,
    ): AgentSessionPort = PreviewAgentSessionPort(MobileContractPreviewLoader(context))
}
