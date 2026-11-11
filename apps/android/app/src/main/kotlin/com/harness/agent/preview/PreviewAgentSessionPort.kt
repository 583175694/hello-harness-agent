package com.harness.agent.preview

import com.harness.agent.model.ActiveSessionState
import com.harness.agent.port.AgentSessionPort
import com.harness.agent.port.PreviewFixtureDescriptor
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

class PreviewAgentSessionPort(
    private val loader: MobileContractPreviewLoader,
    scope: CoroutineScope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate),
) : AgentSessionPort {
    private val replayController = ReplayController(scope)
    private val _sessionState =
        MutableStateFlow(
            ActiveSessionState(),
        )

    override val sessionState: StateFlow<ActiveSessionState> = _sessionState.asStateFlow()

    override suspend fun loadPreviewFixture(fileName: String) {
        replayController.cancel()
        val loaded = loader.load(fileName)
        _sessionState.value = loaded
        replayController.startAssistantTailIfNeeded(_sessionState, loaded.replay)
    }

    override fun listPreviewFixtures(): List<PreviewFixtureDescriptor> = loader.listFixtures()

    fun applyPreviewAction(action: PreviewUiAction) {
        _sessionState.value = PreviewSessionReducer.reduce(_sessionState.value, action)
    }
}
