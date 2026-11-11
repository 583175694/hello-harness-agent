package com.harness.agent.port

import com.harness.agent.model.ActiveSessionState
import com.harness.agent.model.ArtifactDownloadPayload
import com.harness.agent.model.ArtifactPreviewPayload
import kotlinx.coroutines.flow.StateFlow

/** Phase A/B 共用语义；Phase A 仅 Preview 实现。 */
interface AgentSessionPort {
    val sessionState: StateFlow<ActiveSessionState>

    suspend fun loadPreviewFixture(fileName: String)

    fun listPreviewFixtures(): List<PreviewFixtureDescriptor>

    /** B0+：Core 联调 readyz / public config；Preview 默认 no-op。 */
    suspend fun refreshReadiness() {}

    suspend fun refreshPublicConfig() {}

    suspend fun refreshSessionList() {}

    /** 登录/登出后清空本地会话与附件状态，并重新 bootstrap。 */
    suspend fun resetForAuthChange() {}

    suspend fun selectSession(sessionId: String) {}

    suspend fun beginNewConversation() {}

    suspend fun renameSession(
        sessionId: String,
        title: String,
    ) {}

    suspend fun togglePinSession(sessionId: String) {}

    suspend fun deleteSession(sessionId: String) {}

    suspend fun submitComposerText(
        text: String,
        modelId: String? = null,
        reasoningEffort: String? = null,
        skillNames: List<String> = emptyList(),
    ): Boolean = true

    suspend fun respondClarification(answer: String) {}

    suspend fun approveToolCalls() {}

    suspend fun rejectToolCalls() {}

    suspend fun cancelActiveRun() {}

    suspend fun sendPendingInput(inputId: String) {}

    suspend fun cancelPendingInput(inputId: String) {}

    suspend fun refreshWorkbench() {}

    suspend fun openWorkbenchPanel() {}

    suspend fun focusWorkbenchToolCall(
        runId: String,
        toolCallId: String,
    ) {}

    fun setWorkbenchOpen(open: Boolean) {}

    fun clearWorkbenchFocusHint() {}

    suspend fun loadOlderMessages(sessionId: String) {}

    suspend fun loadOlderSessionSummaries() {}

    suspend fun previewArtifact(artifactId: String): Result<ArtifactPreviewPayload> =
        Result.failure(UnsupportedOperationException("preview unavailable"))

    suspend fun downloadArtifact(artifactId: String): Result<ArtifactDownloadPayload> =
        Result.failure(UnsupportedOperationException("download unavailable"))

    suspend fun previewFile(fileId: String): Result<ArtifactPreviewPayload> =
        Result.failure(UnsupportedOperationException("preview unavailable"))

    suspend fun downloadFile(fileId: String): Result<ArtifactDownloadPayload> =
        Result.failure(UnsupportedOperationException("download unavailable"))

    /** B6 / M-RUN-6：App 进后台时断开 SSE。 */
    fun onAppBackground() {}

    /** B6 / M-RUN-6：回前台恢复 Run 观察。 */
    suspend fun onAppForeground() {}

    suspend fun restoreArtifactVersion(
        artifactId: String,
        expectedCurrentArtifactId: String,
    ) {}

    fun beginArtifactRevision(artifactId: String) {}

    fun clearComposerRevisionSeed() {}

    /** B3：Core 联调时本地累积 Skill，随下次 createRun 提交。 */
    fun addComposerSkill(skill: String) {}

    suspend fun uploadComposerAttachment(
        fileName: String,
        bytes: ByteArray,
        mediaType: String,
        previewUri: String? = null,
    ) {}

    fun removeComposerAttachment(fileId: String) {}

}

data class PreviewFixtureDescriptor(
    val fileName: String,
    val scenarioId: String,
    val title: String,
)
