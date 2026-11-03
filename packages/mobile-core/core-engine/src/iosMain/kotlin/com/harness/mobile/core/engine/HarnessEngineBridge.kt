package com.harness.mobile.core.engine

import com.harness.mobile.core.api.ConnectionState
import com.harness.mobile.core.api.EngineConfig
import com.harness.mobile.core.api.HarnessMobileEngine
import com.harness.mobile.core.api.MobileActiveSessionSnapshot
import com.harness.mobile.core.api.ProblemDetails
import com.harness.mobile.core.api.PublicAgentConfig
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.launch
import kotlin.io.encoding.Base64
import kotlin.io.encoding.ExperimentalEncodingApi

/**
 * Swift 侧 Core Port 入口：避免直接消费 StateFlow（后续可换 SKIE / NativeCoroutines）。
 */
class HarnessEngineBridge(
    private val apiBaseUrlProvider: () -> String,
    private val sessionCookieHeaderProvider: () -> String?,
) {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main)
    private val engine: HarnessMobileEngine =
        DefaultHarnessMobileEngineFactory.create(
            EngineConfig(
                apiBaseUrlProvider = { apiBaseUrlProvider() },
                getSessionCookieHeader = { sessionCookieHeaderProvider()?.takeIf { it.isNotBlank() } },
            ),
        )

    private var observationJob: Job? = null

    fun close() {
        observationJob?.cancel()
        scope.cancel()
    }

    fun startObserving(onUpdate: (CoreEngineViewState) -> Unit) {
        observationJob?.cancel()
        observationJob =
            scope.launch {
                combine(
                    engine.activeSnapshot,
                    engine.connectionState,
                    engine.lastProblem,
                ) { snapshot, connection, problem ->
                    CoreEngineViewState(snapshot, connection, problem)
                }.collect { state ->
                    onUpdate(state)
                }
            }
    }

    fun refreshReadiness(onComplete: (Boolean, String?) -> Unit) {
        scope.launch {
            val result = engine.refreshReadiness()
            onComplete(result.isSuccess, result.exceptionOrNull()?.message)
        }
    }

    fun refreshPublicConfig(onComplete: (Boolean, String?) -> Unit) {
        scope.launch {
            val result = engine.refreshPublicConfig()
            onComplete(result.isSuccess, result.exceptionOrNull()?.message)
        }
    }

    fun refreshSessionList(onComplete: (Boolean, String?) -> Unit) {
        scope.launch {
            val result = engine.refreshSessionList()
            onComplete(result.isSuccess, result.exceptionOrNull()?.message)
        }
    }

    fun selectSession(sessionId: String) {
        scope.launch { engine.selectSession(sessionId) }
    }

    fun beginNewConversation() {
        scope.launch { engine.beginNewConversation() }
    }

    fun renameSession(
        sessionId: String,
        title: String,
    ) {
        scope.launch { engine.renameSession(sessionId, title) }
    }

    fun togglePinSession(sessionId: String) {
        scope.launch {
            val row = engine.activeSnapshot.value?.drawerSessions?.firstOrNull { it.id == sessionId }
            val nextPinned = !(row?.pinned ?: false)
            engine.setSessionPinned(sessionId, nextPinned)
        }
    }

    fun deleteSession(sessionId: String) {
        scope.launch { engine.deleteSession(sessionId) }
    }

    fun fetchComposerModelOptions(onComplete: (List<ComposerModelOptionBridge>) -> Unit) {
        scope.launch {
            var config: PublicAgentConfig? = engine.publicConfig.value
            if (config == null) {
                engine.refreshPublicConfig()
                config = engine.publicConfig.value
            }
            onComplete(config?.toComposerModelOptions() ?: emptyList())
        }
    }

    fun listSkills(
        query: String?,
        onComplete: (Boolean, String?, List<String>) -> Unit,
    ) {
        scope.launch {
            val result = engine.listSkills(query)
            if (result.isSuccess) {
                val names = result.getOrThrow().skills.map { it.name }
                onComplete(true, null, names)
            } else {
                onComplete(false, result.exceptionOrNull()?.message, emptyList())
            }
        }
    }

    @OptIn(ExperimentalEncodingApi::class)
    fun uploadComposerAttachmentBase64(
        fileName: String,
        base64Payload: String,
        mediaType: String,
        onComplete: (Boolean, String?, String?, String?) -> Unit,
    ) {
        scope.launch {
            val bytes =
                runCatching { Base64.decode(base64Payload) }
                    .getOrElse {
                        onComplete(false, it.message, null, null)
                        return@launch
                    }
            val result = engine.uploadComposerAttachment(fileName, bytes, mediaType)
            if (result.isSuccess) {
                val ref = result.getOrThrow()
                onComplete(true, null, ref.fileId, ref.fileName)
            } else {
                onComplete(false, result.exceptionOrNull()?.message, null, null)
            }
        }
    }

    fun removeComposerAttachment(fileId: String) {
        engine.removeComposerAttachment(fileId)
    }

    fun submitComposer(
        text: String,
        modelId: String? = null,
        reasoningEffort: String? = null,
        skillNames: List<String> = emptyList(),
        attachmentIds: List<String> = emptyList(),
        onComplete: (Boolean) -> Unit = {},
    ) {
        scope.launch {
            val result = engine.submitComposer(text, modelId, reasoningEffort, skillNames, attachmentIds)
            onComplete(result.isSuccess)
        }
    }

    fun resetForAuthChange(onComplete: () -> Unit = {}) {
        scope.launch {
            engine.resetForAuthChange()
            onComplete()
        }
    }

    fun respondClarification(
        answer: String,
        onComplete: (Boolean, String?) -> Unit,
    ) {
        scope.launch {
            val result = engine.respondClarification(answer)
            onComplete(result.isSuccess, result.exceptionOrNull()?.message)
        }
    }

    fun approveToolCalls(onComplete: (Boolean, String?) -> Unit) {
        scope.launch {
            val result = engine.approveToolCalls()
            onComplete(result.isSuccess, result.exceptionOrNull()?.message)
        }
    }

    fun rejectToolCalls(onComplete: (Boolean, String?) -> Unit) {
        scope.launch {
            val result = engine.rejectToolCalls()
            onComplete(result.isSuccess, result.exceptionOrNull()?.message)
        }
    }

    fun cancelActiveRun() {
        scope.launch { engine.cancelActiveRun() }
    }

    fun sendPendingInput(inputId: String) {
        scope.launch { engine.sendPendingInput(inputId) }
    }

    fun promotePendingInput(inputId: String) {
        scope.launch { engine.promotePendingInput(inputId) }
    }

    fun cancelPendingInput(inputId: String) {
        scope.launch { engine.cancelPendingInput(inputId) }
    }

    fun refreshWorkbench(onComplete: (Boolean, String?) -> Unit = { _, _ -> }) {
        scope.launch {
            val result = engine.refreshWorkbench()
            onComplete(result.isSuccess, result.exceptionOrNull()?.message)
        }
    }

    fun openWorkbenchPanel(onComplete: (Boolean, String?) -> Unit = { _, _ -> }) {
        scope.launch {
            val result = engine.openWorkbenchPanel()
            onComplete(result.isSuccess, result.exceptionOrNull()?.message)
        }
    }

    fun focusWorkbenchToolCall(
        runId: String,
        toolCallId: String,
        onComplete: (Boolean, String?) -> Unit = { _, _ -> },
    ) {
        scope.launch {
            val result =
                engine.focusWorkbench(
                    com.harness.mobile.core.api.MobileWorkbenchFocusTarget(
                        kind = "tool_call",
                        runId = runId,
                        toolCallId = toolCallId,
                        stepId = toolCallId,
                    ),
                    pinned = true,
                )
            onComplete(result.isSuccess, result.exceptionOrNull()?.message)
        }
    }

    fun setWorkbenchOpen(open: Boolean) {
        engine.setWorkbenchOpen(open)
    }

    fun clearWorkbenchFocusHint() {
        engine.clearWorkbenchFocusHint()
    }

    fun loadOlderMessages(
        sessionId: String,
        onComplete: (Boolean, String?) -> Unit = { _, _ -> },
    ) {
        scope.launch {
            val result = engine.loadOlderMessages(sessionId)
            onComplete(result.isSuccess, result.exceptionOrNull()?.message)
        }
    }

    fun bootstrapIfConfigured() {
        scope.launch {
            if (apiBaseUrlProvider().trim().isEmpty()) return@launch
            engine.refreshReadiness()
            engine.refreshPublicConfig()
            engine.refreshSessionList()
            engine.beginNewConversation()
        }
    }

    fun onAppBackground() {
        engine.onAppBackground()
    }

    fun onAppForeground(onComplete: (Boolean, String?) -> Unit = { _, _ -> }) {
        scope.launch {
            val result = engine.onAppForeground()
            onComplete(result.isSuccess, result.exceptionOrNull()?.message)
        }
    }

    fun restoreArtifactVersion(
        artifactId: String,
        expectedCurrentArtifactId: String,
        onComplete: (Boolean, String?) -> Unit = { _, _ -> },
    ) {
        scope.launch {
            val result = engine.restoreArtifactVersion(artifactId, expectedCurrentArtifactId)
            onComplete(result.isSuccess, result.exceptionOrNull()?.message)
        }
    }

    fun beginArtifactRevision(artifactId: String) {
        engine.beginArtifactRevision(artifactId)
    }

    fun clearRevisionContext() {
        engine.clearRevisionContext()
    }

    fun clearComposerRevisionSeed() {
        engine.clearComposerRevisionSeed()
    }
}

private fun PublicAgentConfig.toComposerModelOptions(): List<ComposerModelOptionBridge> =
    models.map { model ->
        val levels =
            if (model.reasoning.supported && model.reasoning.levels.isNotEmpty()) {
                model.reasoning.levels
            } else {
                listOf(model.reasoning.default.ifBlank { "off" })
            }
        ComposerModelOptionBridge(
            id = model.id,
            label = model.label,
            reasoningOptions = levels,
        )
    }

data class CoreEngineViewState(
    val snapshot: MobileActiveSessionSnapshot?,
    val connection: ConnectionState,
    val problem: ProblemDetails?,
)
