package com.harness.mobile.core.engine

import com.harness.mobile.core.api.ApiProblem
import com.harness.mobile.core.api.ArtifactDownloadContent
import com.harness.mobile.core.api.ArtifactPreviewContent
import com.harness.mobile.core.api.ArtifactSeriesRef
import com.harness.mobile.core.api.ArtifactVersionContext
import com.harness.mobile.core.api.ConnectionState
import com.harness.mobile.core.api.EngineConfig
import com.harness.mobile.core.api.ListSessionsResponse
import com.harness.mobile.core.api.SessionActiveRun
import com.harness.mobile.core.api.SessionDetail
import com.harness.mobile.core.api.SessionPagination
import com.harness.mobile.core.api.FileRef
import com.harness.mobile.core.api.MobileActiveSessionSnapshot
import com.harness.mobile.core.api.MobileWorkbenchFocusTarget
import com.harness.mobile.core.api.awaitFileReady
import com.harness.mobile.core.api.PersistedMessage
import com.harness.mobile.core.api.PublicAgentConfig
import com.harness.mobile.core.api.formatCreateRunFailureDetail
import com.harness.mobile.core.api.isAuthRequired
import com.harness.mobile.core.api.normalizeSkillNameForRun
import com.harness.mobile.core.api.resolveComposerRunModel
import com.harness.mobile.core.api.SessionSummary
import com.harness.mobile.core.api.UpdateSessionRequest
import com.harness.mobile.core.data.HarnessArtifactsClient
import com.harness.mobile.core.data.HarnessFilesClient
import com.harness.mobile.core.data.HarnessPendingInputsClient
import com.harness.mobile.core.data.HarnessRunsClient
import com.harness.mobile.core.data.HarnessSessionsClient
import com.harness.mobile.core.data.HarnessSkillsClient
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch

internal class SessionEngineController(
    private val config: EngineConfig,
    private val scope: CoroutineScope,
    private val publicConfigProvider: () -> PublicAgentConfig?,
    private val onConnectionState: (ConnectionState) -> Unit = {},
) {
    private companion object {
        /** 与服务端 `AGENT_PROTOCOL_LIMITS.sessionTitleMaxLength` 保持一致。 */
        const val PROVISIONAL_SESSION_TITLE_MAX_LENGTH = 28
    }

    private val sessionsClient = HarnessSessionsClient.create(config)
    private val runsClient = HarnessRunsClient.create(config)
    private val pendingInputsClient = HarnessPendingInputsClient.create(config)
    private val filesClient = HarnessFilesClient.create(config)
    private val skillsClient = HarnessSkillsClient.create(config)
    private val artifactsClient = HarnessArtifactsClient.create(config)
    private val pendingAttachments = SessionAttachmentQueue()
    private val runLoop = RunObserverLoop(config)
    private val runReducer = RunLiveReducer()
    private var liveRun: LiveRunState? = null
    /** 与 Web `activeRunId` Ref 对齐：当前观察中的 runId。 */
    private var activeRunId: String? = null
    private val runObserverJobs = mutableMapOf<String, Job>()
    private val liveRunBySession = mutableMapOf<String, LiveRunState>()
    /** run 已判定放弃：禁止后续 detail 刷新把 observer 重新挂上，避免无限重连。 */
    private val abandonedRunBySession = mutableMapOf<String, String>()
    private var followUpSyncJob: Job? = null
    private var sessionListRefreshJob: Job? = null
    private var liveUiCoalesceJob: Job? = null
    private var pendingLiveUi: LiveRunState? = null

    private val summaries = mutableListOf<SessionSummary>()
    private var sessionListBefore: String? = null
    private var sessionListHasMore = false
    private var loadingOlderSessionSummaries = false
    private var selectedSessionId: String? = null
    private val pendingSessions = mutableSetOf<String>()
    private val loadedSessions = mutableSetOf<String>()
    private val detailInFlight = mutableSetOf<String>()
    private val paginationBefore = mutableMapOf<String, String?>()
    private val paginationHasMore = mutableMapOf<String, Boolean>()
    private val sessionMessages = mutableMapOf<String, List<PersistedMessage>>()
    private val sessionArtifactSeries = mutableMapOf<String, List<ArtifactSeriesRef>>()
    private var composerRevisionContext: ArtifactVersionContext? = null
    private val loadingOlder = mutableSetOf<String>()
    private var workbenchChrome = WorkbenchChromeState()

    private val _activeSnapshot = MutableStateFlow<MobileActiveSessionSnapshot?>(null)
    val activeSnapshot: StateFlow<MobileActiveSessionSnapshot?> = _activeSnapshot.asStateFlow()

    suspend fun refreshSessionList(): Result<Unit> =
        runCatching {
            val response = sessionsClient.listSessions(limit = 100)
            val merged = SessionSnapshotProjector.mergeSessionListFirstPage(response.sessions, summaries)
            summaries.clear()
            summaries.addAll(merged)
            syncSessionListPagination(response)
            publishSnapshot()
            Unit
        }

    suspend fun loadOlderSessionSummaries(): Result<Unit> =
        runCatching {
            val before = sessionListBefore
            if (!sessionListHasMore || before.isNullOrBlank() || loadingOlderSessionSummaries) {
                return@runCatching Unit
            }
            loadingOlderSessionSummaries = true
            publishSessionListLoading(true)
            try {
                val response = sessionsClient.listSessions(limit = 100, before = before)
                val merged = SessionSnapshotProjector.mergeOlderSessionSummaries(summaries, response.sessions)
                summaries.clear()
                summaries.addAll(merged)
                syncSessionListPagination(response)
            } finally {
                loadingOlderSessionSummaries = false
                publishSessionListLoading(false)
            }
            publishSnapshot()
            Unit
        }

    private fun syncSessionListPagination(response: ListSessionsResponse) {
        sessionListBefore = response.pagination?.nextBefore
        sessionListHasMore = response.pagination?.hasMore == true
    }

    private fun publishSessionListLoading(loading: Boolean) {
        val current = _activeSnapshot.value ?: return
        publishActive(
            current.copy(
                loadingOlderSessionSummaries = loading,
                canLoadOlderSessionSummaries = sessionListHasMore,
            ),
        )
    }

    suspend fun selectSession(sessionId: String) {
        if (selectedSessionId != sessionId) {
            resetWorkbenchChrome()
        }
        selectedSessionId = sessionId
        // docs/45 §5.7：已加载过的会话须立即从 cache 投影，不能等 loadSessionDetail 早退。
        if (loadedSessions.contains(sessionId)) {
            publishActiveSessionFromCache(sessionId)
        }
        loadSessionDetail(sessionId, force = false)
    }

    suspend fun loadSessionDetail(
        sessionId: String,
        force: Boolean,
    ): Result<Unit> =
        runCatching {
            // R1：pending 时跳过普通 refresh；force 仍拉终态/ drawer。
            if (pendingSessions.contains(sessionId) && !force) {
                return@runCatching Unit
            }
            if (!force && (loadedSessions.contains(sessionId) || detailInFlight.contains(sessionId))) {
                return@runCatching Unit
            }
            detailInFlight.add(sessionId)
            val hadCache = _activeSnapshot.value?.sessionId == sessionId && _activeSnapshot.value?.conversation?.isNotEmpty() == true
            if (!hadCache) {
                publishActive(
                    (_activeSnapshot.value ?: emptyLanding()).copy(sessionDetailLoading = true),
                )
            }
            try {
                val detail = sessionsClient.getSession(sessionId, limit = 100).session
                // R10
                if (pendingSessions.contains(sessionId)) {
                    return@runCatching Unit
                }
                loadedSessions.add(sessionId)
                val activeRun = detail.activeRun
                val shouldObserve = activeRun != null && abandonedRunBySession[sessionId] != activeRun.runId
                if (shouldObserve) {
                    pendingSessions.add(sessionId)
                } else {
                    pendingSessions.remove(sessionId)
                }
                paginationBefore[sessionId] = detail.pagination?.nextBefore
                paginationHasMore[sessionId] = detail.pagination?.hasMore == true
                sessionMessages[sessionId] = detail.messages
                sessionArtifactSeries[sessionId] = detail.artifactSeries
                // E1：晚到的 detail 只更新 cache；用户已切走时不覆盖当前 UI、也不改 selectedSessionId。
                val isCurrentSelection = selectedSessionId == sessionId
                if (isCurrentSelection) {
                    val merged =
                        mergeDetailWithLive(
                            detail = detail,
                            runningSessionIds = pendingSessions.toSet(),
                        )
                    publishActive(
                        merged.copy(
                            sessionDetailLoading = false,
                            workbench = merged.workbench,
                            workbenchRunId = merged.workbenchRunId,
                        ),
                    )
                    activeRun?.takeIf { shouldObserve }?.let { active ->
                        val live = runReducer.fromActiveRun(detail, active)
                        attachRunObserver(live, publishToUi = true)
                    } ?: run {
                        latestAssistantRunId(detail.messages)?.let { runId ->
                            scope.launch { hydrateRunDetail(sessionId, runId) }
                        }
                    }
                } else {
                    publishSnapshot()
                    activeRun?.takeIf { shouldObserve }?.let { active ->
                        val live = runReducer.fromActiveRun(detail, active)
                        attachRunObserver(live, publishToUi = false)
                    }
                }
            } catch (failure: Throwable) {
                loadedSessions.remove(sessionId)
                throw failure
            } finally {
                detailInFlight.remove(sessionId)
            }
            Unit
        }

    suspend fun loadOlderMessages(sessionId: String): Result<Unit> =
        runCatching {
            val before = paginationBefore[sessionId]
            if (before.isNullOrBlank() || paginationHasMore[sessionId] != true || loadingOlder.contains(sessionId)) {
                return@runCatching Unit
            }
            loadingOlder.add(sessionId)
            if (selectedSessionId == sessionId) {
                setLoadingOlderOnSnapshot(true)
            }
            try {
                val detail =
                    sessionsClient.getSession(sessionId, limit = 100, before = before).session
                paginationBefore[sessionId] = detail.pagination?.nextBefore
                paginationHasMore[sessionId] = detail.pagination?.hasMore == true
                val merged =
                    SessionSnapshotProjector.mergeMessagePages(
                        existing = sessionMessages[sessionId].orEmpty(),
                        olderPage = detail.messages,
                    )
                sessionMessages[sessionId] = merged
                if (selectedSessionId == sessionId) {
                    publishConversationFromCache(sessionId)
                }
            } finally {
                loadingOlder.remove(sessionId)
                if (selectedSessionId == sessionId) {
                    setLoadingOlderOnSnapshot(false)
                }
            }
            Unit
        }

    /** E9：401 / AUTH_REQUIRED 时停止 SSE observer，避免 mid-run 悬挂。 */
    internal fun abortRunObserversForAuth() {
        runObserverJobs.values.forEach { it.cancel() }
        runObserverJobs.clear()
        liveRunBySession.clear()
        abandonedRunBySession.clear()
        liveRun = null
        activeRunId = null
        pendingSessions.clear()
    }

    /** docs/45 §4.9：后台断开 SSE，保留 pending Run 状态。 */
    fun onAppBackground() {
        followUpSyncJob?.cancel()
        followUpSyncJob = null
        runObserverJobs.values.forEach { it.cancel() }
        runObserverJobs.clear()
        cancelLiveUiCoalesce()
    }

    /** 登录态切换：清空会话、附件、observer 与缓存，避免上一个账号的数据泄漏。 */
    fun resetForAuthChange() {
        runObserverJobs.values.forEach { it.cancel() }
        runObserverJobs.clear()
        liveRunBySession.clear()
        abandonedRunBySession.clear()
        pendingSessions.clear()
        pendingAttachments.clearAll()
        liveRun = null
        activeRunId = null
        cancelLiveUiCoalesce()
        followUpSyncJob?.cancel()
        followUpSyncJob = null
        sessionListRefreshJob?.cancel()
        sessionListRefreshJob = null
        summaries.clear()
        sessionListBefore = null
        sessionListHasMore = false
        loadingOlderSessionSummaries = false
        selectedSessionId = null
        loadedSessions.clear()
        detailInFlight.clear()
        paginationBefore.clear()
        paginationHasMore.clear()
        sessionMessages.clear()
        sessionArtifactSeries.clear()
        loadingOlder.clear()
        composerRevisionContext = null
        workbenchChrome = WorkbenchChromeState()
        publishActive(emptyLanding())
    }

    suspend fun onAppForeground() {
        refreshSessionList()
        val pending = pendingSessions.toList()
        for (sessionId in pending) {
            val cached = liveRunBySession[sessionId]
            if (cached != null && !isTerminal(cached.deliveryStatus)) {
                attachRunObserver(cached, publishToUi = selectedSessionId == sessionId)
                continue
            }
            val detail = runCatching { sessionsClient.getSession(sessionId, limit = 100).session }.getOrNull()
            val active = detail?.activeRun
            if (active == null || abandonedRunBySession[sessionId] == active.runId) {
                pendingSessions.remove(sessionId)
                liveRunBySession.remove(sessionId)
                continue
            }
            val snapshot = runCatching { runsClient.getRun(active.runId) }.getOrNull()
            if (snapshot != null && isTerminal(snapshot.status)) {
                pendingSessions.remove(sessionId)
                liveRunBySession.remove(sessionId)
                refreshSessionListDebounced()
                if (selectedSessionId == sessionId) {
                    loadSessionDetail(sessionId, force = true)
                }
                continue
            }
            val live = runReducer.fromActiveRun(detail, active)
            attachRunObserver(live, publishToUi = selectedSessionId == sessionId)
        }
        val sessionId = selectedSessionId
        if (sessionId != null && pendingSessions.contains(sessionId)) {
            loadSessionDetail(sessionId, force = true)
        }
    }

    suspend fun beginNewConversation() {
        selectedSessionId?.let { sessionId ->
            pendingAttachments.clear(sessionId)
        }
        selectedSessionId = null
        resetWorkbenchChrome()
        publishActive(landingSnapshot(selectedId = null))
    }

    suspend fun refreshWorkbench(): Result<Unit> =
        runCatching {
            openWorkbenchPanel(hydrateOnly = true)
            Unit
        }

    suspend fun openWorkbenchPanel(hydrateOnly: Boolean = false) {
        val sessionId = selectedSessionId ?: return
        val snap = _activeSnapshot.value
        val runId =
            snap?.workbenchRunId
                ?: latestAssistantRunId(sessionMessages[sessionId].orEmpty())
                ?: return
        runCatching { hydrateRunDetail(sessionId, runId) }
        if (!hydrateOnly) {
            workbenchChrome = workbenchChrome.copy(open = true)
            _activeSnapshot.value?.let { publishActive(it) }
        }
    }

    suspend fun focusWorkbench(
        target: MobileWorkbenchFocusTarget,
        pinned: Boolean = true,
    ) {
        val sessionId = selectedSessionId ?: return
        runCatching { hydrateRunDetail(sessionId, target.runId) }
        val snap = _activeSnapshot.value ?: return
        val wb = snap.workbench
        val runId = snap.workbenchRunId ?: target.runId
        if (wb == null || runId != target.runId) {
            workbenchChrome =
                workbenchChrome.copy(
                    open = true,
                    followMode = if (pinned) "pinned" else "auto",
                    focusTarget =
                        target.copy(
                            kind = "activity",
                            toolCallId = null,
                            stepId = null,
                            artifactId = null,
                        ),
                    focusHint = "无法定位到该步骤，已打开 Activity 总览",
                    focusedToolCallId = null,
                )
            publishActive(
                snap.copy(
                    workbench = wb?.copy(initialView = "activity") ?: snap.workbench,
                    workbenchRunId = runId,
                ),
            )
            return
        }
        val resolved = WorkbenchFocusProjector.apply(wb, target)
        workbenchChrome =
            workbenchChrome.copy(
                open = true,
                followMode = if (pinned) "pinned" else "auto",
                focusTarget = resolved.focusTarget,
                focusHint = if (resolved.degraded) resolved.hint else null,
                focusedToolCallId = resolved.focusedToolCallId,
            )
        publishActive(
            snap.copy(
                workbench = wb.copy(initialView = resolved.view),
                workbenchRunId = runId,
            ),
        )
    }

    fun setWorkbenchOpen(open: Boolean) {
        workbenchChrome = workbenchChrome.copy(open = open)
        _activeSnapshot.value?.let { publishActive(it) }
    }

    fun setFollowMode(mode: String) {
        val normalized = if (mode == "pinned") "pinned" else "auto"
        workbenchChrome = workbenchChrome.copy(followMode = normalized)
        _activeSnapshot.value?.let { publishActive(it) }
    }

    fun suppressAutoOpen(_runId: String) {
        // Native apps never auto-open Workbench while a run is streaming.
        // Keep this API as a compatibility no-op for existing clients.
    }

    fun clearWorkbenchFocusHint() {
        if (workbenchChrome.focusHint == null) return
        workbenchChrome = workbenchChrome.copy(focusHint = null)
        _activeSnapshot.value?.let { publishActive(it) }
    }

    suspend fun previewArtifact(artifactId: String): Result<ArtifactPreviewContent> =
        runCatching { artifactsClient.previewArtifact(artifactId) }

    suspend fun downloadArtifact(artifactId: String): Result<ArtifactDownloadContent> =
        runCatching { artifactsClient.downloadArtifact(artifactId) }

    suspend fun previewFile(fileId: String): Result<ArtifactPreviewContent> =
        runCatching { artifactsClient.previewFile(fileId) }

    suspend fun downloadFile(fileId: String): Result<ArtifactDownloadContent> =
        runCatching { artifactsClient.downloadFile(fileId) }

    suspend fun restoreArtifactVersion(
        artifactId: String,
        expectedCurrentArtifactId: String,
    ): Result<Unit> =
        runCatching {
            val trimmedArtifact = artifactId.trim()
            val trimmedExpected = expectedCurrentArtifactId.trim()
            if (trimmedArtifact.isEmpty() || trimmedExpected.isEmpty()) {
                error("Missing artifact ids for restore")
            }
            artifactsClient.restoreArtifact(
                artifactId = trimmedArtifact,
                expectedCurrentArtifactId = trimmedExpected,
                idempotencyKey = randomClientId(),
            )
            val sessionId = selectedSessionId ?: return@runCatching Unit
            loadSessionDetail(sessionId, force = true)
            refreshWorkbench()
            Unit
        }

    private suspend fun hydrateRunDetail(
        sessionId: String,
        runId: String,
    ) {
        if (selectedSessionId != sessionId) return
        val detail = runCatching { runsClient.getRunDetail(runId) }.getOrNull() ?: return
        val projected = WorkbenchDetailProjector.fromRunDetail(detail)
        val merged =
            WorkbenchDetailProjector.mergeDeliverables(
                incoming = projected,
                previous = _activeSnapshot.value?.workbench,
            )
        val withArtifacts =
            WorkbenchArtifactProjector.applySeries(
                merged,
                sessionArtifactSeries[sessionId].orEmpty(),
            )
        if (selectedSessionId != sessionId) return
        publishActive(
            (_activeSnapshot.value ?: emptyLanding()).copy(
                workbench = withArtifacts,
                workbenchRunId = runId,
            ),
        )
    }

    private fun latestAssistantRunId(messages: List<PersistedMessage>): String? =
        messages.lastOrNull { it.role == "assistant" && !it.runId.isNullOrBlank() }?.runId

    suspend fun createSession(title: String): Result<Unit> =
        runCatching {
            val created = sessionsClient.createSession(provisionalSessionTitle(title)).session
            summaries.removeAll { it.id == created.id }
            summaries.add(created)
            selectedSessionId = created.id
            resetWorkbenchChrome()
            loadedSessions.remove(created.id)
            publishSnapshot()
            publishConversationFromCache(created.id)
            loadSessionDetail(created.id, force = true)
            Unit
        }

    suspend fun updateSession(
        sessionId: String,
        title: String?,
        isPinned: Boolean?,
    ): Result<Unit> =
        runCatching {
            val updated =
                sessionsClient.updateSession(
                    sessionId,
                    UpdateSessionRequest(title = title, isPinned = isPinned),
                ).session
            val index = summaries.indexOfFirst { it.id == sessionId }
            if (index >= 0) {
                summaries[index] = updated
            } else {
                summaries.add(updated)
            }
            publishSnapshot()
            if (selectedSessionId == sessionId) {
                loadSessionDetail(sessionId, force = true)
            }
            Unit
        }

    suspend fun deleteSession(sessionId: String): Result<Unit> =
        runCatching {
            sessionsClient.deleteSession(sessionId)
            clearSessionObservers(sessionId)
            summaries.removeAll { it.id == sessionId }
            loadedSessions.remove(sessionId)
            pendingSessions.remove(sessionId)
            paginationBefore.remove(sessionId)
            paginationHasMore.remove(sessionId)
            sessionMessages.remove(sessionId)
            sessionArtifactSeries.remove(sessionId)
            pendingAttachments.clear(sessionId)
            abandonedRunBySession.remove(sessionId)
            if (selectedSessionId == sessionId) {
                val next = SessionSnapshotProjector.sortSummaries(summaries).firstOrNull()
                if (next != null) {
                    selectedSessionId = next.id
                    loadedSessions.remove(next.id)
                    loadSessionDetail(next.id, force = true)
                } else {
                    beginNewConversation()
                }
            } else {
                publishSnapshot()
            }
            Unit
        }

    private fun clearSessionObservers(sessionId: String) {
        val runIds =
            sequenceOf(
                liveRunBySession[sessionId]?.runId,
                liveRun?.takeIf { it.sessionId == sessionId }?.runId,
            ).filterNotNull().distinct().toList()
        runIds.forEach { runId ->
            runObserverJobs.remove(runId)?.cancel()
            if (activeRunId == runId) activeRunId = null
            if (liveRun?.runId == runId) liveRun = null
            if (pendingLiveUi?.runId == runId) cancelLiveUiCoalesce()
        }
        liveRunBySession.remove(sessionId)
        pendingSessions.remove(sessionId)
        abandonedRunBySession.remove(sessionId)
    }

    private fun publishSnapshot() {
        val selected = selectedSessionId
        if (selected == null) {
            publishActive(landingSnapshot(selectedId = null))
            return
        }
        val current = _activeSnapshot.value
        if (current?.sessionId == selected && current.conversation.isNotEmpty()) {
            publishActive(
                current.copy(
                    drawerSessions =
                        SessionSnapshotProjector.drawerRows(
                            summaries = summaries,
                            selectedId = selected,
                            runningSessionIds = pendingSessions.toSet(),
                        ),
                    canLoadOlderSessionSummaries = sessionListHasMore,
                    loadingOlderSessionSummaries = loadingOlderSessionSummaries,
                ),
            )
        } else {
            publishActive(
                landingSnapshot(selectedId = selected)
                    .copy(sessionId = selected, title = summaries.firstOrNull { it.id == selected }?.title ?: "会话"),
            )
        }
    }

    private fun emptyLanding(): MobileActiveSessionSnapshot = landingSnapshot(selectedId = selectedSessionId)

    /**
     * landing 快照同样携带会话列表分页状态；否则 `refreshSessionList()` 之后紧接着的
     * “新对话”发布会把 hasMore/nextBefore 覆盖成未分页，Drawer 只能显示“已全部加载”。
     */
    private fun landingSnapshot(selectedId: String?): MobileActiveSessionSnapshot =
        SessionSnapshotProjector.landingSnapshot(
            summaries = summaries,
            selectedId = selectedId,
            runningSessionIds = pendingSessions.toSet(),
            canLoadOlderSessionSummaries = sessionListHasMore,
            loadingOlderSessionSummaries = loadingOlderSessionSummaries,
        )

    private fun provisionalSessionTitle(text: String): String =
        text.trim().take(PROVISIONAL_SESSION_TITLE_MAX_LENGTH).trim().ifBlank { "新对话" }

    suspend fun listSkills(query: String? = null) =
        runCatching { skillsClient.listSkills(query) }

    suspend fun uploadComposerAttachment(
        fileName: String,
        bytes: ByteArray,
        mediaType: String,
    ): Result<FileRef> =
        runCatching {
            val sessionId = ensureSessionForComposer(fileName.ifBlank { "附件" })
            val uploaded = filesClient.uploadFile(sessionId, fileName, bytes, mediaType)
            val ready = awaitFileReady(getFile = { filesClient.getFile(it) }, fileId = uploaded.fileId)
            pendingAttachments.add(sessionId, ready)
            ready
        }

    fun removeComposerAttachment(fileId: String) {
        val trimmed = fileId.trim()
        if (trimmed.isEmpty()) return
        pendingAttachments.remove(trimmed)
    }

    private suspend fun ensureSessionForComposer(titleHint: String): String {
        var sessionId = selectedSessionId
        if (sessionId == null) {
            val created = sessionsClient.createSession(provisionalSessionTitle(titleHint)).session
            summaries.removeAll { it.id == created.id }
            summaries.add(created)
            sessionId = created.id
            selectedSessionId = sessionId
            loadedSessions.remove(sessionId)
            publishConversationFromCache(sessionId)
        }
        return sessionId
    }

    suspend fun submitComposer(
        text: String,
        modelId: String? = null,
        reasoningEffort: String? = null,
        skillNames: List<String> = emptyList(),
        attachmentIds: List<String> = emptyList(),
    ): Result<Unit> =
        runCatching {
            val trimmed = text.trim()
            if (trimmed.isEmpty()) return@runCatching Unit
            val sessionId = ensureSessionForComposer(trimmed)
            if (runtimeActiveFor(sessionId)) {
                val kind =
                    pendingInputsClient.submitPendingInput(
                        sessionId = sessionId,
                        content = trimmed,
                        idempotencyKey = randomClientId(),
                    )
                if (kind != "pending") {
                    error("当前任务已结束，请重新发送。")
                }
                pendingAttachments.clear(sessionId)
                refreshPendingInputsUi(sessionId)
                return@runCatching Unit
            }
            val publicConfig =
                publicConfigProvider()
                    ?: error("Public agent config not loaded")
            val (model, reasoning) = resolveComposerRunModel(publicConfig, modelId, reasoningEffort)
            val skillsForRun = skillNames.mapNotNull(::normalizeSkillNameForRun).distinct()
            val pendingRefs = pendingAttachments.refs(sessionId)
            val attachments = attachmentIds.ifEmpty { pendingAttachments.fileIds(sessionId) }
            val optimisticUserAttachments = pendingRefs
            pendingSessions.add(sessionId)
            publishLiveRun(null, submitting = true)
            val response =
                try {
                    runsClient.createRun(
                        sessionId = sessionId,
                        content = trimmed,
                        model = model,
                        reasoningEffort = reasoning,
                        idempotencyKey = randomClientId(),
                        skillNames = skillsForRun,
                        attachmentIds = attachments,
                        artifactVersionContext = composerRevisionContext,
                    )
                } catch (failure: Throwable) {
                    pendingSessions.remove(sessionId)
                    publishCreateRunFailure(sessionId, trimmed, failure, optimisticUserAttachments)
                    runCatching { loadSessionDetail(sessionId, force = true) }
                    throw failure
                }
            pendingAttachments.clear(sessionId)
            composerRevisionContext = null
            clearComposerRevisionSeedOnSnapshot()
            startRunFromCreateResponse(sessionId, trimmed, response, optimisticUserAttachments)
            Unit
        }

    fun beginArtifactRevision(artifactId: String) {
        val trimmed = artifactId.trim()
        if (trimmed.isEmpty()) return
        val wb = _activeSnapshot.value?.workbench ?: return
        val version = wb.artifactVersions.firstOrNull { it.id == trimmed } ?: return
        val seriesId = version.seriesId ?: return
        val expected = version.expectedCurrentArtifactId ?: return
        val versionNumber = version.versionNumber ?: return
        val logicalName = version.logicalName ?: "文件"
        composerRevisionContext =
            ArtifactVersionContext(
                seriesId = seriesId,
                baseArtifactId = trimmed,
                expectedCurrentArtifactId = expected,
            )
        val seed = "请基于 $logicalName v$versionNumber 修改："
        publishActive(
            (_activeSnapshot.value ?: emptyLanding()).copy(composerRevisionSeed = seed),
        )
    }

    fun clearRevisionContext() {
        composerRevisionContext = null
        clearComposerRevisionSeedOnSnapshot()
    }

    fun clearComposerRevisionSeed() {
        clearComposerRevisionSeedOnSnapshot()
    }

    private fun clearComposerRevisionSeedOnSnapshot() {
        val snap = _activeSnapshot.value ?: return
        if (snap.composerRevisionSeed == null) return
        publishActive(
            snap.copy(composerRevisionSeed = null),
        )
    }

    suspend fun sendPendingInput(inputId: String): Result<Unit> =
        runCatching {
            val sessionId = selectedSessionId ?: error("No selected session")
            val content =
                _activeSnapshot.value?.followUps?.firstOrNull { it.id == inputId }?.content
                    ?: error("Unknown pending input")
            val response =
                try {
                    pendingInputsClient.sendPendingInput(inputId)
                } catch (failure: Throwable) {
                    publishCreateRunFailure(sessionId, content, failure)
                    throw failure
                }
            startRunFromCreateResponse(sessionId, content, response)
            refreshPendingInputsUi(sessionId)
            Unit
        }

    suspend fun promotePendingInput(inputId: String): Result<Unit> =
        runCatching {
            val sessionId = selectedSessionId ?: error("No selected session")
            pendingInputsClient.promotePendingInput(inputId)
            refreshPendingInputsUi(sessionId)
            Unit
        }

    suspend fun cancelPendingInput(inputId: String): Result<Unit> =
        runCatching {
            pendingInputsClient.cancelPendingInput(inputId)
            val sessionId = selectedSessionId ?: return@runCatching Unit
            refreshPendingInputsUi(sessionId)
            Unit
        }

    private fun activeLiveForSelection(): LiveRunState? {
        val sessionId = selectedSessionId ?: return null
        return liveRunBySession[sessionId] ?: liveRun?.takeIf { it.sessionId == sessionId }
    }

    suspend fun cancelActiveRun(): Result<Unit> =
        runCatching {
            val runId = activeLiveForSelection()?.runId ?: return@runCatching Unit
            runsClient.cancelRun(runId)
            Unit
        }

    suspend fun respondClarification(answer: String): Result<Unit> =
        runCatching {
            val live = activeLiveForSelection() ?: error("No active run")
            val clarification = live.composerClarification ?: error("No pending clarification")
            val trimmed = answer.trim()
            if (trimmed.isEmpty()) error("Empty clarification answer")
            val response =
                runsClient.controlRun(
                    live.runId,
                    com.harness.mobile.core.api.RunControlRespondCommand(
                        interruptId = clarification.interruptId,
                        payload = com.harness.mobile.core.api.RunControlRespondPayload(trimmed),
                    ),
                )
            applyControlSnapshot(live, response.snapshot)
            Unit
        }

    suspend fun approveToolCalls(): Result<Unit> =
        runCatching {
            val live = activeLiveForSelection() ?: error("No active run")
            val approval = live.composerToolApproval ?: error("No pending tool approval")
            val decisions =
                approval.items.map {
                    com.harness.mobile.core.api.ToolApprovalDecisionDto(
                        itemId = it.itemId,
                        toolCallId = it.toolCallId,
                        argumentsHash = it.argumentsHash,
                        decision = "approve",
                    )
                }
            val response =
                runsClient.controlRun(
                    live.runId,
                    com.harness.mobile.core.api.RunControlApproveCommand(
                        interruptId = approval.interruptId,
                        decisions = decisions,
                    ),
                )
            applyControlSnapshot(live, response.snapshot)
            Unit
        }

    suspend fun rejectToolCalls(): Result<Unit> =
        runCatching {
            val live = activeLiveForSelection() ?: error("No active run")
            val approval = live.composerToolApproval ?: error("No pending tool approval")
            val decisions =
                approval.items.map {
                    com.harness.mobile.core.api.ToolApprovalDecisionDto(
                        itemId = it.itemId,
                        toolCallId = it.toolCallId,
                        argumentsHash = it.argumentsHash,
                        decision = "reject",
                    )
                }
            val response =
                runsClient.controlRun(
                    live.runId,
                    com.harness.mobile.core.api.RunControlRejectCommand(
                        interruptId = approval.interruptId,
                        decisions = decisions,
                    ),
                )
            applyControlSnapshot(live, response.snapshot)
            Unit
        }

    private fun applyControlSnapshot(
        prior: LiveRunState,
        snapshot: com.harness.mobile.core.api.RunSnapshot,
    ) {
        var next = runReducer.applySnapshot(prior, snapshot)
        next =
            next.copy(
                composerClarification = null,
                composerToolApproval = null,
            )
        liveRunBySession[next.sessionId] = next
        if (selectedSessionId == next.sessionId) {
            liveRun = next
            activeRunId = next.runId
            publishLiveRun(next, submitting = false)
        }
    }

    private fun runtimeActiveFor(sessionId: String): Boolean {
        if (pendingSessions.contains(sessionId)) return true
        val cached = liveRunBySession[sessionId]
        if (cached != null && !isTerminal(cached.deliveryStatus)) return true
        val live = liveRun
        if (live != null && live.sessionId == sessionId && !isTerminal(live.deliveryStatus)) {
            return true
        }
        if (activeRunId != null && live?.sessionId == sessionId) return true
        return false
    }

    private fun publishActiveSessionFromCache(sessionId: String) {
        val messages = sessionMessages[sessionId] ?: return
        val summary = summaries.find { it.id == sessionId }
        val live =
            liveRunBySession[sessionId]
                ?: liveRun?.takeIf { it.sessionId == sessionId }
        val activeRun =
            if (live != null && !isTerminal(live.deliveryStatus)) {
                SessionActiveRun(
                    runId = live.runId,
                    assistantMessageId = live.assistantMessageId,
                    status = live.deliveryStatus,
                )
            } else {
                null
            }
        val hasMore = paginationHasMore[sessionId] == true
        val detail =
            SessionDetail(
                id = sessionId,
                title = summary?.title ?: "对话",
                createdAt = summary?.createdAt ?: "",
                updatedAt = summary?.updatedAt ?: "",
                isPinned = summary?.isPinned ?: false,
                messages = messages,
                pagination =
                    if (hasMore) {
                        SessionPagination(
                            limit = 100,
                            hasMore = true,
                            nextBefore = paginationBefore[sessionId],
                        )
                    } else {
                        null
                    },
                activeRun = activeRun,
                artifactSeries = sessionArtifactSeries[sessionId].orEmpty(),
            )
        val merged = mergeDetailWithLive(detail, pendingSessions.toSet())
        publishActive(merged.copy(sessionDetailLoading = false))
    }

    private fun publishConversationFromCache(sessionId: String) {
        val messages = sessionMessages[sessionId].orEmpty()
        var conversation = SessionSnapshotProjector.conversationFromMessages(messages)
        val live = liveRun
        if (live != null && live.sessionId == sessionId) {
            val liveConversation = runReducer.toConversation(live)
            val liveAssistant = liveConversation.lastOrNull { it.kind == "assistant" }
            val detailAssistant = conversation.lastOrNull { it.kind == "assistant" }
            if (assistantLiveRichness(liveAssistant) >= assistantLiveRichness(detailAssistant)) {
                conversation = mergeLiveConversation(conversation, live)
            }
        }
        val current = _activeSnapshot.value ?: emptyLanding()
        publishActive(
            current.copy(
                sessionId = sessionId,
                conversation = conversation,
                isLanding = conversation.isEmpty(),
                canLoadOlderMessages = paginationHasMore[sessionId] == true,
                loadingOlderMessages = false,
            ),
        )
    }

    private fun mergeDetailWithLive(
        detail: com.harness.mobile.core.api.SessionDetail,
        runningSessionIds: Set<String>,
    ): MobileActiveSessionSnapshot {
        val projected =
            SessionSnapshotProjector.fromDetail(
                detail = detail,
                summaries = summaries,
                runningSessionIds = runningSessionIds,
            )
        val live = liveRun
        if (live == null || live.sessionId != detail.id || selectedSessionId != detail.id) {
            return withArtifactSeriesOnWorkbench(projected, detail)
        }
        // R6：不以 stale detail 覆盖更丰富的 live assistant
        val liveConversation = runReducer.toConversation(live)
        val detailAssistant = projected.conversation.lastOrNull { it.kind == "assistant" }
        val liveAssistant = liveConversation.lastOrNull { it.kind == "assistant" }
        val prior = _activeSnapshot.value
        val withConversation =
            if (assistantLiveRichness(liveAssistant) >= assistantLiveRichness(detailAssistant)) {
                projected.copy(conversation = mergeLiveConversation(projected.conversation, live))
            } else {
                projected
            }
        val shell =
            if (prior?.sessionId == detail.id) {
                withConversation.copy(
                    workbench = prior.workbench,
                    workbenchRunId = prior.workbenchRunId,
                )
            } else {
                withConversation
            }
        return withArtifactSeriesOnWorkbench(shell, detail)
    }

    private fun withArtifactSeriesOnWorkbench(
        snapshot: MobileActiveSessionSnapshot,
        detail: SessionDetail,
    ): MobileActiveSessionSnapshot {
        sessionArtifactSeries[detail.id] = detail.artifactSeries
        if (detail.artifactSeries.isEmpty()) return snapshot
        val base =
            snapshot.workbench
                ?: WorkbenchArtifactProjector.placeholderFromSeries(
                    detail.artifactSeries,
                    latestAssistantRunId(detail.messages),
                )
        val wb = WorkbenchArtifactProjector.applySeries(base, detail.artifactSeries)
        return snapshot.copy(
            workbench = wb,
            workbenchRunId = snapshot.workbenchRunId ?: latestAssistantRunId(detail.messages),
        )
    }

    /** O1：同一 runId 仅一个 observer；不同 run 可并行（多会话后台 Run）。 */
    private fun attachRunObserver(
        initial: LiveRunState,
        publishToUi: Boolean,
        skipInitialSnapshot: Boolean = false,
    ) {
        val sessionId = initial.sessionId
        val runId = initial.runId
        if (abandonedRunBySession[sessionId] == runId) return
        if (runObserverJobs[runId]?.isActive == true) return
        runObserverJobs[runId]?.cancel()
        liveRunBySession[sessionId] = initial
        pendingSessions.add(sessionId)
        if (publishToUi || selectedSessionId == sessionId) {
            liveRun = initial
            activeRunId = initial.runId
            publishLiveRun(initial, submitting = false)
        }
        runObserverJobs[runId] =
            scope.launch {
                var terminalReached = false
                try {
                    runLoop.observeRun(
                        initial = initial,
                        skipInitialSnapshot = skipInitialSnapshot,
                        onState = { updated, immediate ->
                            liveRunBySession[sessionId] = updated
                            if (selectedSessionId == sessionId) {
                                liveRun = updated
                                activeRunId = updated.runId
                                publishLiveRun(updated, submitting = false, immediate = immediate)
                            } else {
                                publishSnapshot()
                            }
                        },
                        onTerminal = { final ->
                            terminalReached = true
                            liveRunBySession.remove(sessionId)
                            pendingSessions.remove(sessionId)
                            val stillExists = summaries.any { it.id == sessionId }
                            if (!stillExists) {
                                publishSnapshot()
                            } else {
                                projectTerminalState(sessionId, runId, final)
                            }
                        },
                        onReconnecting = {
                            onConnectionState(ConnectionState.Reconnecting)
                        },
                        onConnected = {
                            onConnectionState(ConnectionState.Live)
                        },
                    )
                } catch (error: CancellationException) {
                    // 新 Run 替换 observer 或 scope 取消：保留 pendingSessions 供后台 Run（E6）
                } catch (error: Throwable) {
                    if (error.isAuthFailure()) {
                        abortRunObserversForAuth()
                    } else {
                        markRunAbandoned(sessionId, runId, error)
                    }
                } finally {
                    runObserverJobs.remove(runId)
                    if (terminalReached) {
                        if (liveRun?.runId == runId) {
                            liveRun = null
                        }
                        if (activeRunId == runId) {
                            activeRunId = null
                        }
                    }
                }
            }
    }

    private fun markRunAbandoned(
        sessionId: String,
        runId: String,
        @Suppress("UNUSED_PARAMETER") error: Throwable,
    ) {
        if (summaries.none { it.id == sessionId }) return
        liveRunBySession.remove(sessionId)
        pendingSessions.remove(sessionId)
        abandonedRunBySession[sessionId] = runId
        if (selectedSessionId == sessionId) {
            val failed =
                (liveRun?.takeIf { it.runId == runId } ?: LiveRunState(
                    sessionId = sessionId,
                    runId = runId,
                    userMessageId = "",
                    assistantMessageId = "",
                    userText = "",
                )).copy(deliveryStatus = "failed")
            liveRun = failed
            publishLiveRun(failed, submitting = false)
        }
        if (activeRunId == runId) activeRunId = null
        onConnectionState(ConnectionState.Offline)
        refreshSessionListDebounced()
        if (selectedSessionId == sessionId) {
            scope.launch { loadSessionDetail(sessionId, force = true) }
        }
    }

    private fun Throwable.isAuthFailure(): Boolean =
        (this as? ApiProblem)?.problem?.isAuthRequired() == true

    private fun refreshSessionListDebounced() {
        sessionListRefreshJob?.cancel()
        sessionListRefreshJob =
            scope.launch {
                delay(500)
                refreshSessionList()
            }
    }

    private suspend fun projectTerminalState(
        sessionId: String,
        runId: String,
        final: LiveRunState,
    ) {
        if (selectedSessionId == sessionId) {
            liveRun = final
            publishLiveRun(final, submitting = false)
        } else {
            publishSnapshot()
        }
        if (activeRunId == runId) activeRunId = null
        if (liveRun?.runId == runId) liveRun = null
        liveRunBySession.remove(sessionId)
        pendingSessions.remove(sessionId)
        refreshSessionListDebounced()
        syncFollowUpAfterTerminal(sessionId)
    }

    private fun syncFollowUpAfterTerminal(sessionId: String) {
        followUpSyncJob?.cancel()
        followUpSyncJob =
            scope.launch {
                val delaysMs = listOf(0L, 150L, 350L, 700L, 1200L)
                for ((index, delayMs) in delaysMs.withIndex()) {
                    if (!isActive) return@launch
                    if (delayMs > 0) delay(delayMs)
                    if (pendingSessions.contains(sessionId)) return@launch
                    val detail = runCatching { sessionsClient.getSession(sessionId, limit = 100).session }.getOrNull()
                        ?: continue
                    if (detail.activeRun != null) {
                        if (selectedSessionId == sessionId) {
                            loadSessionDetail(sessionId, force = true)
                        }
                        return@launch
                    }
                    if (index == delaysMs.lastIndex && selectedSessionId == sessionId) {
                        loadSessionDetail(sessionId, force = true)
                    }
                }
            }
    }

    private fun isTerminal(status: String): Boolean =
        status == "completed" || status == "failed" || status == "cancelled"

    private suspend fun refreshPendingInputsUi(sessionId: String) {
        val detail = sessionsClient.getSession(sessionId, limit = 100).session
        val followUps = SessionSnapshotProjector.followUpsFromDetail(detail)
        val current = _activeSnapshot.value ?: emptyLanding()
        publishActive(
            current.copy(
                followUps = followUps,
                drawerSessions =
                    SessionSnapshotProjector.drawerRows(
                        summaries = summaries,
                        selectedId = sessionId,
                        runningSessionIds = pendingSessions.toSet(),
                    ),
            ),
        )
    }

    private fun startRunFromCreateResponse(
        sessionId: String,
        userText: String,
        response: com.harness.mobile.core.api.CreateRunResponse,
        userAttachments: List<FileRef> = emptyList(),
    ) {
        val live = runReducer.fromCreateRun(sessionId, userText, response, userAttachments)
        liveRunBySession[sessionId] = live
        if (selectedSessionId == sessionId) {
            liveRun = live
            activeRunId = live.runId
            publishLiveRun(live, submitting = false)
        }
        attachRunObserver(live, publishToUi = selectedSessionId == sessionId)
    }

    private fun setLoadingOlderOnSnapshot(loading: Boolean) {
        val current = _activeSnapshot.value ?: return
        publishActive(
            current.copy(loadingOlderMessages = loading),
        )
    }

    private fun publishCreateRunFailure(
        sessionId: String,
        userText: String,
        failure: Throwable,
        userAttachments: List<FileRef> = emptyList(),
    ) {
        val detail = formatCreateRunFailureDetail(failure)
        val title =
            summaries.firstOrNull { it.id == sessionId }?.title
                ?: userText.take(40).ifBlank { "会话" }
        val prior = _activeSnapshot.value
        publishActive(
            MobileActiveSessionSnapshot(
                sessionId = sessionId,
                title = title,
                isLanding = false,
                drawerSessions =
                    SessionSnapshotProjector.drawerRows(
                        summaries = summaries,
                        selectedId = sessionId,
                        runningSessionIds = pendingSessions.toSet(),
                    ),
                conversation =
                    listOf(
                        com.harness.mobile.core.api.MobileConversationLine(
                            id = "create-failure:${sessionId}:user",
                            kind = "user",
                            content = userText,
                            attachments = userAttachments,
                        ),
                        com.harness.mobile.core.api.MobileConversationLine(
                            id = "create-failure:${sessionId}:assistant",
                            kind = "assistant",
                            content = detail,
                            deliveryStatus = "failed",
                        ),
                    ),
                followUps = prior?.followUps.orEmpty(),
                sessionDetailLoading = false,
                composerSubmitting = false,
                workbench = prior?.workbench,
                workbenchRunId = prior?.workbenchRunId,
                canLoadOlderMessages = paginationHasMore[sessionId] == true,
                canLoadOlderSessionSummaries = sessionListHasMore,
                loadingOlderSessionSummaries = loadingOlderSessionSummaries,
            ),
        )
    }

    private fun cancelLiveUiCoalesce() {
        pendingLiveUi = null
        liveUiCoalesceJob?.cancel()
        liveUiCoalesceJob = null
    }

    /**
     * Text deltas coalesce to one UI publish per frame.
     * Tool and lifecycle events pass [immediate] so they are not held behind that window.
     */
    private fun publishLiveRun(
        live: LiveRunState?,
        submitting: Boolean,
        immediate: Boolean = true,
    ) {
        if (immediate || submitting || live == null) {
            pendingLiveUi = null
            liveUiCoalesceJob?.cancel()
            liveUiCoalesceJob = null
            publishLiveRunNow(live, submitting)
            return
        }
        pendingLiveUi = live
        if (liveUiCoalesceJob?.isActive == true) return
        liveUiCoalesceJob =
            scope.launch {
                delay(33)
                val latest = pendingLiveUi ?: return@launch
                pendingLiveUi = null
                publishLiveRunNow(latest, submitting = false)
            }
    }

    private fun publishLiveRunNow(
        live: LiveRunState?,
        submitting: Boolean,
    ) {
        val sessionId = live?.sessionId ?: selectedSessionId
        val title =
            summaries.firstOrNull { it.id == sessionId }?.title
                ?: live?.userText?.take(40)
                ?: "新对话"
        val conversation =
            when {
                live != null -> mergeLiveConversation(live)
                else -> _activeSnapshot.value?.conversation.orEmpty()
            }
        val prior = _activeSnapshot.value
        publishActive(
            MobileActiveSessionSnapshot(
                sessionId = sessionId,
                title = title,
                isLanding = conversation.isEmpty() && sessionId == null,
                drawerSessions =
                    SessionSnapshotProjector.drawerRows(
                        summaries = summaries,
                        selectedId = sessionId,
                        runningSessionIds = pendingSessions.toSet(),
                    ),
                conversation = conversation,
                followUps = prior?.followUps.orEmpty(),
                sessionDetailLoading = submitting,
                composerSubmitting = submitting,
                workbench = prior?.workbench,
                workbenchRunId = prior?.workbenchRunId,
                canLoadOlderMessages = paginationHasMore[sessionId] == true,
                canLoadOlderSessionSummaries = sessionListHasMore,
                loadingOlderSessionSummaries = loadingOlderSessionSummaries,
                loadingOlderMessages = prior?.loadingOlderMessages ?: false,
                composerClarification = live?.composerClarification,
                composerToolApproval = live?.composerToolApproval,
            ),
        )
    }

    /** Keep prior turns visible while the current run is replacing only its tail. */
    private fun mergeLiveConversation(live: LiveRunState): List<com.harness.mobile.core.api.MobileConversationLine> {
        val current = _activeSnapshot.value
            ?.takeIf { it.sessionId == live.sessionId }
            ?.conversation
            ?: SessionSnapshotProjector.conversationFromMessages(sessionMessages[live.sessionId].orEmpty())
        return mergeLiveConversation(current, live)
    }

    private fun assistantLiveRichness(line: com.harness.mobile.core.api.MobileConversationLine?): Int {
        if (line == null || line.kind != "assistant") return 0
        val body =
            buildString {
                append(line.pendingText.orEmpty())
                append(line.finalText.orEmpty())
                append(line.content)
            }
        val processScore =
            line.process.sumOf { block ->
                when (block.kind) {
                    "tool" -> 64 + block.content.length
                    else -> block.content.length
                }
            }
        return body.length + processScore + line.process.size * 8
    }

    private fun mergeLiveConversation(
        current: List<com.harness.mobile.core.api.MobileConversationLine>,
        live: LiveRunState,
    ): List<com.harness.mobile.core.api.MobileConversationLine> {
        val liveConversation = runReducer.toConversation(live)
        if (current.size >= 2) {
            val user = current[current.lastIndex - 1]
            val assistant = current.last()
            if (user.kind == "user" && user.content == live.userText && assistant.kind == "assistant") {
                val liveUser = liveConversation.firstOrNull { it.kind == "user" }
                val mergedUser =
                    when {
                        liveUser == null -> user
                        liveUser.attachments.isEmpty() && user.attachments.isNotEmpty() ->
                            liveUser.copy(attachments = user.attachments)
                        else -> liveUser
                    }
                val liveAssistant = liveConversation.lastOrNull()
                val mergedAssistant = if (liveAssistant != null && liveAssistant.process.isEmpty() && assistant.process.isNotEmpty()) {
                    liveAssistant.copy(process = assistant.process)
                } else {
                    liveAssistant
                }
                return current.dropLast(2) + listOf(mergedUser) + listOfNotNull(mergedAssistant)
            }
        }
        return current + liveConversation
    }

    private fun publishActive(snapshot: MobileActiveSessionSnapshot) {
        _activeSnapshot.value =
            snapshot.copy(
                // 会话列表分页只由列表接口维护；detail/live 投影不得把它覆盖回默认值。
                canLoadOlderSessionSummaries = sessionListHasMore,
                loadingOlderSessionSummaries = loadingOlderSessionSummaries,
                workbenchOpen = workbenchChrome.open,
                followMode = workbenchChrome.followMode,
                workbenchFocusTarget = workbenchChrome.focusTarget,
                workbenchFocusHint = workbenchChrome.focusHint,
                workbenchFocusedToolCallId = workbenchChrome.focusedToolCallId,
            )
    }

    private fun resetWorkbenchChrome() {
        workbenchChrome = WorkbenchChromeState()
    }

    private data class WorkbenchChromeState(
        val open: Boolean = false,
        val followMode: String = "auto",
        val focusTarget: MobileWorkbenchFocusTarget? = null,
        val focusHint: String? = null,
        val focusedToolCallId: String? = null,
    )
}
