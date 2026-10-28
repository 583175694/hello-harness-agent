package com.harness.agent.port

import com.harness.agent.model.ActiveSessionState
import kotlinx.coroutines.flow.StateFlow

/** Phase A/B 共用语义；Phase A 仅 Preview 实现。 */
interface AgentSessionPort {
    val sessionState: StateFlow<ActiveSessionState>

    suspend fun loadPreviewFixture(fileName: String)

    fun listPreviewFixtures(): List<PreviewFixtureDescriptor>
}

data class PreviewFixtureDescriptor(
    val fileName: String,
    val scenarioId: String,
    val title: String,
)
