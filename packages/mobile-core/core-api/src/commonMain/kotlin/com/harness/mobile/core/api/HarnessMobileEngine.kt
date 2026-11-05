package com.harness.mobile.core.api

import kotlinx.coroutines.flow.StateFlow

/**
 * Phase B 对外 Facade（对齐 docs/43 §4.6、docs/45 §3）。
 * UI 经各端 [CoreAgentSessionPort] 订阅，禁止 Screen 直连 HTTP/SSE。
 */
interface HarnessMobileEngine {
    val connectionState: StateFlow<ConnectionState>
    val serviceStatus: StateFlow<ServiceStatus?>
    val publicConfig: StateFlow<PublicAgentConfig?>
    val lastProblem: StateFlow<ProblemDetails?>
    val activeSnapshot: StateFlow<MobileActiveSessionSnapshot?>

    /** 消费完 Toast 等一次性展示后调用，避免错误状态粘滞。 */
    fun clearLastProblem()

    suspend fun refreshReadiness(): Result<Unit>

    suspend fun refreshPublicConfig(): Result<Unit>

    suspend fun refreshSessionList(): Result<Unit>

    /** 登录/登出后重置会话、附件、observer 与缓存，再重新 bootstrap。 */
    suspend fun resetForAuthChange(): Result<Unit>

    suspend fun selectSession(sessionId: String)

    suspend fun loadSessionDetail(
        sessionId: String,
        force: Boolean = false,
    ): Result<Unit>

    suspend fun loadOlderMessages(sessionId: String): Result<Unit>

    suspend fun loadOlderSessionSummaries(): Result<Unit>

    suspend fun previewArtifact(artifactId: String): Result<ArtifactPreviewContent>

    suspend fun downloadArtifact(artifactId: String): Result<ArtifactDownloadContent>

    suspend fun previewFile(fileId: String): Result<ArtifactPreviewContent>

    suspend fun downloadFile(fileId: String): Result<ArtifactDownloadContent>

    suspend fun beginNewConversation()

    suspend fun createSession(title: String): Result<Unit>

    suspend fun renameSession(
        sessionId: String,
        title: String,
    ): Result<Unit>

    suspend fun setSessionPinned(
        sessionId: String,
        pinned: Boolean,
    ): Result<Unit>

    suspend fun deleteSession(sessionId: String): Result<Unit>

    suspend fun listSkills(query: String? = null): Result<SkillsListResponse>

    suspend fun uploadComposerAttachment(
        fileName: String,
        bytes: ByteArray,
        mediaType: String,
    ): Result<FileRef>

    fun removeComposerAttachment(fileId: String)

    suspend fun submitComposer(
        text: String,
        modelId: String? = null,
        reasoningEffort: String? = null,
        skillNames: List<String> = emptyList(),
        attachmentIds: List<String> = emptyList(),
    ): Result<Unit>

    suspend fun respondClarification(answer: String): Result<Unit>

    suspend fun approveToolCalls(): Result<Unit>

    suspend fun rejectToolCalls(): Result<Unit>

    suspend fun cancelActiveRun(): Result<Unit>

    suspend fun sendPendingInput(inputId: String): Result<Unit>

    /** Run 进行中：将队列项 promote 为 steer（`POST …/pending-inputs/:id/steer`）。 */
    suspend fun promotePendingInput(inputId: String): Result<Unit>

    suspend fun cancelPendingInput(inputId: String): Result<Unit>

    /** B5：打开 Workbench 前补水（`GET …/runs/:id/detail`）。 */
    suspend fun refreshWorkbench(): Result<Unit>

    /** B5 / 45 §4.7：打开 Workbench 面板（先 hydrate，再 `workbenchOpen=true`）。 */
    suspend fun openWorkbenchPanel(): Result<Unit>

    /** B5 / M-CONV-7：定位 Workbench（先 hydrate，再 pinned followMode）。 */
    suspend fun focusWorkbench(
        target: MobileWorkbenchFocusTarget,
        pinned: Boolean = true,
    ): Result<Unit>

    fun setWorkbenchOpen(open: Boolean)

    fun setFollowMode(mode: String)

    fun suppressAutoOpen(runId: String)

    fun clearWorkbenchFocusHint()

    /** B6 / M-RUN-6：进后台关闭 SSE，不 cancel Run。 */
    fun onAppBackground()

    /** B6 / M-RUN-6：回前台刷新 Session 列表并恢复 Run 观察。 */
    suspend fun onAppForeground(): Result<Unit>

    /** B5：`POST …/artifacts/:id/restore` 后 force refresh Session + Workbench。 */
    suspend fun restoreArtifactVersion(
        artifactId: String,
        expectedCurrentArtifactId: String,
    ): Result<Unit>

    /** M-CMP-13：Workbench 选版本 → 预填 Composer + 下次 createRun 带 artifactVersionContext。 */
    fun beginArtifactRevision(artifactId: String)

    fun clearRevisionContext()

    fun clearComposerRevisionSeed()
}

enum class ConnectionState {
    Idle,
    Connecting,
    Live,
    Reconnecting,
    Offline,
    ServiceUnavailable,
}

data class EngineConfig(
    /** 每次请求读取，便于 Settings 改 URL 后无需重建 Engine。 */
    val apiBaseUrlProvider: suspend () -> String,
    val getSessionCookieHeader: suspend () -> String?,
)

interface HarnessMobileEngineFactory {
    fun create(config: EngineConfig): HarnessMobileEngine
}
