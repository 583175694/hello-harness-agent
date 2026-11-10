package com.harness.agent.port

import com.harness.agent.core.CoreServices
import com.harness.agent.core.toComposerModelOptions
import com.harness.agent.model.ActiveSessionState
import com.harness.agent.model.ArtifactDownloadPayload
import com.harness.agent.model.ArtifactPreviewPayload
import com.harness.agent.model.ComposerAttachmentItem
import com.harness.agent.model.ComposerModelOption
import com.harness.mobile.core.api.FileRef
import com.harness.mobile.core.engine.DefaultHarnessMobileEngineFactory
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import com.harness.agent.media.resolveAttachmentPreviewUri
import com.harness.agent.ui.chat.formatApiProblemToast
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.launch

class CoreAgentSessionPort(
    val services: CoreServices,
    private val scope: CoroutineScope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate),
) : AgentSessionPort, ComposerCatalogPort, ApiErrorToastSource {
    private val engine = DefaultHarnessMobileEngineFactory.create(services.engineConfig())
    private val composerSkills = mutableListOf<String>()
    private val composerAttachmentItems = mutableListOf<ComposerAttachmentItem>()
    private val composerAttachmentPreviewByFileId = mutableMapOf<String, String>()

    private val _sessionState = MutableStateFlow(ActiveSessionState())
    override val sessionState: StateFlow<ActiveSessionState> = _sessionState.asStateFlow()

    private val _composerModelOptions = MutableStateFlow<List<ComposerModelOption>>(emptyList())
    override val composerModelOptions: StateFlow<List<ComposerModelOption>> = _composerModelOptions.asStateFlow()

    private val _skillPickerNames = MutableStateFlow<List<String>>(emptyList())
    override val skillPickerNames: StateFlow<List<String>> = _skillPickerNames.asStateFlow()

    private val _apiErrorToasts = MutableSharedFlow<String>(extraBufferCapacity = 8)
    override val apiErrorToasts: SharedFlow<String> = _apiErrorToasts.asSharedFlow()

    init {
        scope.launch {
            engine.publicConfig.collect { config ->
                _composerModelOptions.value = config?.toComposerModelOptions() ?: emptyList()
            }
        }
        scope.launch {
            engine.lastProblem.collect { problem ->
                    if (problem == null) return@collect
                    formatApiProblemToast(problem)?.let { message ->
                        _apiErrorToasts.emit(message)
                    }
                    engine.clearLastProblem()
                }
        }
        scope.launch {
            combine(
                engine.connectionState,
                engine.activeSnapshot,
            ) { connection, snapshot ->
                CoreSessionMapper.merge(snapshot, connection)
            }.collect { merged ->
                var ui = enrichConversationAttachmentPreviews(merged)
                if (composerSkills.isNotEmpty()) {
                    ui = ui.copy(composer = ui.composer.copy(selectedSkills = composerSkills.toList()))
                }
                ui =
                    ui.copy(
                        composer =
                            ui.composer.copy(
                                attachmentItems = composerAttachmentItems.toList(),
                                attachmentNames = composerAttachmentItems.map { it.fileName },
                            ),
                    )
                _sessionState.value = ui
            }
        }
        scope.launch {
            bootstrapIfConfigured()
        }
    }

    override suspend fun loadPreviewFixture(fileName: String) {
        error("CoreAgentSessionPort does not load preview fixtures")
    }

    override fun listPreviewFixtures(): List<PreviewFixtureDescriptor> = emptyList()

    override suspend fun refreshReadiness() {
        engine.refreshReadiness()
    }

    override suspend fun refreshPublicConfig() {
        engine.refreshPublicConfig()
    }

    override suspend fun refreshSessionList() {
        engine.refreshSessionList()
    }

    override suspend fun selectSession(sessionId: String) {
        clearComposerAttachments()
        engine.selectSession(sessionId)
    }

    override suspend fun beginNewConversation() {
        clearComposerAttachments()
        engine.beginNewConversation()
    }

    override suspend fun renameSession(
        sessionId: String,
        title: String,
    ) {
        engine.renameSession(sessionId, title)
    }

    override suspend fun togglePinSession(sessionId: String) {
        val row = engine.activeSnapshot.value?.drawerSessions?.firstOrNull { it.id == sessionId }
        val nextPinned = !(row?.pinned ?: false)
        engine.setSessionPinned(sessionId, nextPinned)
    }

    override suspend fun deleteSession(sessionId: String) {
        if (engine.activeSnapshot.value?.sessionId == sessionId) {
            clearComposerAttachments()
        }
        engine.deleteSession(sessionId)
    }

    private fun clearComposerAttachments() {
        composerAttachmentItems.clear()
        publishComposerAttachments()
    }

    override suspend fun refreshSkillPicker() {
        engine.listSkills(null).onSuccess { response ->
            val names = response.skills.map { it.name.trim() }.filter { it.isNotEmpty() }
            _skillPickerNames.value = names
        }
    }

    override fun addComposerSkill(skill: String) {
        val normalized = skill.trim()
        if (normalized.isEmpty() || normalized in composerSkills || composerSkills.size >= 6) return
        composerSkills.add(normalized)
        _sessionState.value =
            _sessionState.value.copy(
                composer = _sessionState.value.composer.copy(selectedSkills = composerSkills.toList()),
            )
    }

    override suspend fun uploadComposerAttachment(
        fileName: String,
        bytes: ByteArray,
        mediaType: String,
        previewUri: String?,
    ) {
        if (composerAttachmentItems.size >= 4) return
        val selectionAtStart = engine.activeSnapshot.value?.sessionId
        val localId = "pending-${System.currentTimeMillis()}-${composerAttachmentItems.size}"
        composerAttachmentItems.add(
            ComposerAttachmentItem(
                id = localId,
                fileName = fileName,
                mediaType = mediaType,
                status = "processing",
                previewUri = previewUri,
            ),
        )
        publishComposerAttachments()
        val ready =
            try {
                engine.uploadComposerAttachment(fileName, bytes, mediaType).getOrThrow()
            } catch (failure: Throwable) {
                composerAttachmentItems.removeAll { it.id == localId }
                publishComposerAttachments()
                throw failure
            }
        if (!selectionStillMatches(selectionAtStart)) {
            composerAttachmentItems.removeAll { it.id == localId }
            publishComposerAttachments()
            error("会话已切换，附件未加入当前草稿")
        }
        if (previewUri != null) composerAttachmentPreviewByFileId[ready.fileId] = previewUri
        composerAttachmentItems.removeAll { it.id == localId }
        composerAttachmentItems.add(ready.toComposerAttachmentItem(previewUri))
        publishComposerAttachments()
    }

    private fun FileRef.toComposerAttachmentItem(fallbackPreview: String?): ComposerAttachmentItem =
        ComposerAttachmentItem(
            id = fileId,
            fileName = fileName,
            mediaType = mediaType,
            status = status,
            previewUri =
                resolveAttachmentPreviewUri(
                    apiBaseUrl = services.apiBaseUrl(),
                    fileId = fileId,
                    serverPreviewUrl = previewUrl,
                    localPreviewUri = composerAttachmentPreviewByFileId[fileId] ?: fallbackPreview,
                ),
        )

    private fun enrichConversationAttachmentPreviews(state: ActiveSessionState): ActiveSessionState {
        val apiBase = services.apiBaseUrl()
        val conversation =
            state.conversation.map { item ->
                if (item !is com.harness.agent.model.ConversationItem.User) return@map item
                item.copy(
                    attachments =
                        item.attachments.map { attachment ->
                            attachment.copy(
                                previewUrl =
                                    resolveAttachmentPreviewUri(
                                        apiBaseUrl = apiBase,
                                        fileId = attachment.fileId,
                                        serverPreviewUrl = attachment.previewUrl,
                                        localPreviewUri = composerAttachmentPreviewByFileId[attachment.fileId],
                                    ),
                            )
                        },
                )
            }
        return state.copy(conversation = conversation)
    }

    private fun publishComposerAttachments() {
        _sessionState.value =
            _sessionState.value.copy(
                composer =
                    _sessionState.value.composer.copy(
                        attachmentItems = composerAttachmentItems.toList(),
                        attachmentNames = composerAttachmentItems.map { it.fileName },
                    ),
            )
    }

    override suspend fun submitComposerText(
        text: String,
        modelId: String?,
        reasoningEffort: String?,
        skillNames: List<String>,
    ): Boolean {
        val skills = skillNames.ifEmpty { composerSkills.toList() }
        val attachmentIds =
            composerAttachmentItems
                .map { it.id }
                .filter { it.isNotBlank() && !it.startsWith("pending-") }
        val selectionAtStart = engine.activeSnapshot.value?.sessionId
        val submitted = engine.submitComposer(text, modelId, reasoningEffort, skills, attachmentIds)
        if (submitted.isSuccess) {
            if (!selectionStillMatches(selectionAtStart)) return true
            clearComposerAttachments()
            composerSkills.clear()
            _sessionState.value =
                _sessionState.value.copy(
                    composer = _sessionState.value.composer.copy(selectedSkills = emptyList()),
                )
        }
        return submitted.isSuccess
    }

    /** 草稿属于“当前选中会话”。未选中时保存后选中也算同一草稿，切到已有会话则视为已切换。 */
    private fun selectionStillMatches(selectionAtStart: String?): Boolean {
        val current = engine.activeSnapshot.value?.sessionId
        return selectionAtStart == null || current == selectionAtStart
    }

    override fun removeComposerAttachment(fileId: String) {
        val trimmed = fileId.trim()
        if (trimmed.isEmpty()) return
        composerAttachmentItems.removeAll { it.id == trimmed }
        engine.removeComposerAttachment(trimmed)
        publishComposerAttachments()
    }

    override suspend fun respondClarification(answer: String) {
        engine.respondClarification(answer)
    }

    override suspend fun approveToolCalls() {
        engine.approveToolCalls()
    }

    override suspend fun rejectToolCalls() {
        engine.rejectToolCalls()
    }

    override suspend fun cancelActiveRun() {
        engine.cancelActiveRun()
    }

    override suspend fun sendPendingInput(inputId: String) {
        val running =
            engine.activeSnapshot.value
                ?.drawerSessions
                ?.any { it.active && it.running } == true
        if (running) {
            engine.promotePendingInput(inputId)
        } else {
            engine.sendPendingInput(inputId)
        }
    }

    override suspend fun cancelPendingInput(inputId: String) {
        engine.cancelPendingInput(inputId)
    }

    override suspend fun refreshWorkbench() {
        engine.refreshWorkbench()
    }

    override suspend fun openWorkbenchPanel() {
        engine.openWorkbenchPanel()
    }

    override suspend fun focusWorkbenchToolCall(
        runId: String,
        toolCallId: String,
    ) {
        engine.focusWorkbench(
            com.harness.mobile.core.api.MobileWorkbenchFocusTarget(
                kind = "tool_call",
                runId = runId,
                toolCallId = toolCallId,
                stepId = toolCallId,
            ),
            pinned = true,
        )
    }

    override fun setWorkbenchOpen(open: Boolean) {
        engine.setWorkbenchOpen(open)
    }

    override fun clearWorkbenchFocusHint() {
        engine.clearWorkbenchFocusHint()
    }

    override suspend fun loadOlderMessages(sessionId: String) {
        engine.loadOlderMessages(sessionId)
    }

    override suspend fun loadOlderSessionSummaries() {
        engine.loadOlderSessionSummaries()
    }

    override suspend fun previewArtifact(artifactId: String): Result<ArtifactPreviewPayload> =
        engine.previewArtifact(artifactId).map { content ->
            ArtifactPreviewPayload(
                bytes = content.bytes,
                contentType = content.contentType,
                fileName = content.fileName,
                binary = content.binary,
            )
        }

    override suspend fun downloadArtifact(artifactId: String): Result<ArtifactDownloadPayload> =
        engine.downloadArtifact(artifactId).map { content ->
            ArtifactDownloadPayload(
                bytes = content.bytes,
                contentType = content.contentType,
                fileName = content.fileName,
            )
        }

    override suspend fun previewFile(fileId: String): Result<ArtifactPreviewPayload> =
        engine.previewFile(fileId).map { content ->
            ArtifactPreviewPayload(
                bytes = content.bytes,
                contentType = content.contentType,
                fileName = content.fileName,
                binary = content.binary,
            )
        }

    override suspend fun downloadFile(fileId: String): Result<ArtifactDownloadPayload> =
        engine.downloadFile(fileId).map { content ->
            ArtifactDownloadPayload(
                bytes = content.bytes,
                contentType = content.contentType,
                fileName = content.fileName,
            )
        }

    override fun onAppBackground() {
        engine.onAppBackground()
    }

    override suspend fun onAppForeground() {
        engine.onAppForeground()
    }

    override suspend fun restoreArtifactVersion(
        artifactId: String,
        expectedCurrentArtifactId: String,
    ) {
        engine.restoreArtifactVersion(artifactId, expectedCurrentArtifactId)
    }

    override fun beginArtifactRevision(artifactId: String) {
        engine.beginArtifactRevision(artifactId)
    }

    override fun clearComposerRevisionSeed() {
        engine.clearComposerRevisionSeed()
    }

    override suspend fun resetForAuthChange() {
        clearComposerAttachments()
        composerSkills.clear()
        engine.resetForAuthChange()
    }

    private suspend fun bootstrapIfConfigured() {
        if (services.engineConfig().apiBaseUrlProvider().trim().isEmpty()) return
        // 未登录时不打受保护接口，避免启动即弹 401；只保留可匿名访问的 readiness/config。
        if (services.tokenStore.getToken().isNullOrBlank()) {
            engine.refreshReadiness()
            return
        }
        refreshReadiness()
        refreshPublicConfig()
        refreshSessionList()
        beginNewConversation()
    }
}
