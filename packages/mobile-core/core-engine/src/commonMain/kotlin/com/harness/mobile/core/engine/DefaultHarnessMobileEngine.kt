package com.harness.mobile.core.engine

import com.harness.mobile.core.api.ApiProblem
import com.harness.mobile.core.api.ConnectionState
import com.harness.mobile.core.api.EngineConfig
import com.harness.mobile.core.api.HarnessMobileEngine
import com.harness.mobile.core.api.HarnessMobileEngineFactory
import com.harness.mobile.core.api.MobileActiveSessionSnapshot
import com.harness.mobile.core.api.ProblemDetails
import com.harness.mobile.core.api.PublicAgentConfig
import com.harness.mobile.core.api.ServiceStatus
import com.harness.mobile.core.data.HarnessAgentHttpClient
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

class DefaultHarnessMobileEngine(
    private val config: EngineConfig,
    private val scope: CoroutineScope = CoroutineScope(SupervisorJob() + Dispatchers.Default),
) : HarnessMobileEngine {
    private val http = HarnessAgentHttpClient.create(config)
    private val sessions =
        SessionEngineController(
            config = config,
            scope = scope,
            publicConfigProvider = { _publicConfig.value },
            onConnectionState = { state -> _connectionState.value = state },
        )

    private val _connectionState = MutableStateFlow(ConnectionState.Idle)
    override val connectionState: StateFlow<ConnectionState> = _connectionState.asStateFlow()

    private val _serviceStatus = MutableStateFlow<ServiceStatus?>(null)
    override val serviceStatus: StateFlow<ServiceStatus?> = _serviceStatus.asStateFlow()

    private val _publicConfig = MutableStateFlow<PublicAgentConfig?>(null)
    override val publicConfig: StateFlow<PublicAgentConfig?> = _publicConfig.asStateFlow()

    private val _lastProblem = MutableStateFlow<ProblemDetails?>(null)
    override val lastProblem: StateFlow<ProblemDetails?> = _lastProblem.asStateFlow()

    override fun clearLastProblem() {
        _lastProblem.value = null
    }

    override val activeSnapshot: StateFlow<MobileActiveSessionSnapshot?> = sessions.activeSnapshot

    override suspend fun refreshReadiness(): Result<Unit> {
        if (config.apiBaseUrlProvider().trim().isEmpty()) {
            _connectionState.value = ConnectionState.Idle
            _serviceStatus.value = null
            _lastProblem.value = null
            return Result.failure(IllegalStateException("apiBaseUrl not configured"))
        }
        _connectionState.value = ConnectionState.Connecting
        return runCatching {
            val status = http.getReadiness()
            _serviceStatus.value = status
            _lastProblem.value = null
            _connectionState.value =
                if (status.isReady) {
                    ConnectionState.Live
                } else {
                    ConnectionState.ServiceUnavailable
                }
            Unit
        }.onFailure { error ->
            _serviceStatus.value = null
            _lastProblem.value = (error as? ApiProblem)?.problem
            _connectionState.value =
                when (error) {
                    is ApiProblem -> ConnectionState.ServiceUnavailable
                    else -> ConnectionState.Offline
                }
        }
    }

    override suspend fun refreshPublicConfig(): Result<Unit> {
        if (config.apiBaseUrlProvider().trim().isEmpty()) {
            return Result.failure(IllegalStateException("apiBaseUrl not configured"))
        }
        return runCatching {
            _publicConfig.value = http.getPublicAgentConfig()
            _lastProblem.value = null
            Unit
        }.onFailure { error ->
            _lastProblem.value = (error as? ApiProblem)?.problem
        }
    }

    override suspend fun refreshSessionList(): Result<Unit> =
        sessions.refreshSessionList().captureAuthAndProblem()

    override suspend fun resetForAuthChange(): Result<Unit> =
        runCatching {
            sessions.resetForAuthChange()
            _lastProblem.value = null
            _serviceStatus.value = null
            refreshReadiness()
            refreshPublicConfig()
            refreshSessionList()
            sessions.beginNewConversation()
            Unit
        }.captureAuthAndProblem()

    private fun <T> Result<T>.captureAuthAndProblem(): Result<T> =
        onFailure { error ->
            val problem = (error as? ApiProblem)?.problem
            if (problem != null) {
                _lastProblem.value = problem
                if (problem.status == 401 || problem.code == "AUTH_REQUIRED") {
                    sessions.abortRunObserversForAuth()
                }
            }
        }

    override suspend fun selectSession(sessionId: String) {
        clearLastProblem()
        sessions.selectSession(sessionId)
    }

    override suspend fun loadSessionDetail(
        sessionId: String,
        force: Boolean,
    ): Result<Unit> = sessions.loadSessionDetail(sessionId, force).captureAuthAndProblem()

    override suspend fun beginNewConversation() {
        clearLastProblem()
        sessions.beginNewConversation()
    }

    override suspend fun createSession(title: String): Result<Unit> =
        sessions.createSession(title).captureAuthAndProblem()

    override suspend fun renameSession(
        sessionId: String,
        title: String,
    ): Result<Unit> = sessions.updateSession(sessionId, title = title, isPinned = null).captureAuthAndProblem()

    override suspend fun setSessionPinned(
        sessionId: String,
        pinned: Boolean,
    ): Result<Unit> = sessions.updateSession(sessionId, title = null, isPinned = pinned).captureAuthAndProblem()

    override suspend fun deleteSession(sessionId: String): Result<Unit> =
        sessions.deleteSession(sessionId).captureAuthAndProblem()

    override suspend fun listSkills(query: String?): Result<com.harness.mobile.core.api.SkillsListResponse> =
        sessions.listSkills(query).captureAuthAndProblem()

    override suspend fun uploadComposerAttachment(
        fileName: String,
        bytes: ByteArray,
        mediaType: String,
    ): Result<com.harness.mobile.core.api.FileRef> =
        sessions.uploadComposerAttachment(fileName, bytes, mediaType).captureAuthAndProblem()

    override fun removeComposerAttachment(fileId: String) {
        sessions.removeComposerAttachment(fileId)
    }

    override suspend fun submitComposer(
        text: String,
        modelId: String?,
        reasoningEffort: String?,
        skillNames: List<String>,
        attachmentIds: List<String>,
    ): Result<Unit> =
        sessions.submitComposer(text, modelId, reasoningEffort, skillNames, attachmentIds).captureAuthAndProblem()

    override suspend fun respondClarification(answer: String): Result<Unit> {
        _lastProblem.value = null
        return sessions.respondClarification(answer).captureAuthAndProblem()
    }

    override suspend fun approveToolCalls(): Result<Unit> =
        sessions.approveToolCalls().captureAuthAndProblem()

    override suspend fun rejectToolCalls(): Result<Unit> =
        sessions.rejectToolCalls().captureAuthAndProblem()

    override suspend fun cancelActiveRun(): Result<Unit> =
        sessions.cancelActiveRun().captureAuthAndProblem()

    override suspend fun sendPendingInput(inputId: String): Result<Unit> =
        sessions.sendPendingInput(inputId).captureAuthAndProblem()

    override suspend fun promotePendingInput(inputId: String): Result<Unit> =
        sessions.promotePendingInput(inputId).captureAuthAndProblem()

    override suspend fun cancelPendingInput(inputId: String): Result<Unit> =
        sessions.cancelPendingInput(inputId).captureAuthAndProblem()

    override suspend fun refreshWorkbench(): Result<Unit> =
        sessions.refreshWorkbench().captureAuthAndProblem()

    override suspend fun openWorkbenchPanel(): Result<Unit> =
        runCatching {
            sessions.openWorkbenchPanel()
            Unit
        }.captureAuthAndProblem()

    override suspend fun focusWorkbench(
        target: com.harness.mobile.core.api.MobileWorkbenchFocusTarget,
        pinned: Boolean,
    ): Result<Unit> =
        runCatching {
            sessions.focusWorkbench(target, pinned)
            Unit
        }.captureAuthAndProblem()

    override fun setWorkbenchOpen(open: Boolean) {
        sessions.setWorkbenchOpen(open)
    }

    override fun setFollowMode(mode: String) {
        sessions.setFollowMode(mode)
    }

    override fun suppressAutoOpen(runId: String) {
        sessions.suppressAutoOpen(runId)
    }

    override fun clearWorkbenchFocusHint() {
        sessions.clearWorkbenchFocusHint()
    }

    override suspend fun loadOlderMessages(sessionId: String): Result<Unit> =
        sessions.loadOlderMessages(sessionId).captureAuthAndProblem()

    override fun onAppBackground() {
        sessions.onAppBackground()
    }

    override suspend fun onAppForeground(): Result<Unit> =
        runCatching {
            sessions.onAppForeground()
            Unit
        }

    override suspend fun restoreArtifactVersion(
        artifactId: String,
        expectedCurrentArtifactId: String,
    ): Result<Unit> =
        sessions.restoreArtifactVersion(artifactId, expectedCurrentArtifactId).captureAuthAndProblem()

    override fun beginArtifactRevision(artifactId: String) {
        sessions.beginArtifactRevision(artifactId)
    }

    override fun clearRevisionContext() {
        sessions.clearRevisionContext()
    }

    override fun clearComposerRevisionSeed() {
        sessions.clearComposerRevisionSeed()
    }
}

object DefaultHarnessMobileEngineFactory : HarnessMobileEngineFactory {
    override fun create(config: EngineConfig): HarnessMobileEngine = DefaultHarnessMobileEngine(config)
}
