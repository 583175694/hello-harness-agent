package com.harness.agent.preview

import android.content.ContentResolver
import android.net.Uri
import android.provider.OpenableColumns
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.harness.agent.model.ActiveSessionState
import com.harness.agent.model.ComposerModelOption
import com.harness.agent.model.PREVIEW_COMPOSER_MODELS
import com.harness.agent.model.SessionDrawerItem
import com.harness.agent.port.ComposerCatalogPort
import java.util.UUID
import com.harness.agent.port.AgentSessionPort
import com.harness.agent.port.PreviewFixtureDescriptor
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import com.harness.agent.port.ApiErrorToastSource
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.emptyFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

class PreviewSessionViewModel(
    private val port: AgentSessionPort,
) : ViewModel() {
    private val previewPort: PreviewAgentSessionPort?
        get() = port as? PreviewAgentSessionPort
    private val isCorePort: Boolean
        get() = previewPort == null

    val coreEngineActive: Boolean
        get() = isCorePort

    private val catalogPort: ComposerCatalogPort?
        get() = port as? ComposerCatalogPort

    private val previewModelCatalog = MutableStateFlow(PREVIEW_COMPOSER_MODELS)
    private val previewSkillNames = MutableStateFlow<List<String>>(emptyList())

    val composerModelCatalog: StateFlow<List<ComposerModelOption>> =
        catalogPort?.composerModelOptions ?: previewModelCatalog.asStateFlow()

    val skillPickerNames: StateFlow<List<String>> =
        catalogPort?.skillPickerNames ?: previewSkillNames.asStateFlow()

    val sessionState: StateFlow<ActiveSessionState> = port.sessionState

    val apiErrorToasts: Flow<String> =
        (port as? ApiErrorToastSource)?.apiErrorToasts ?: emptyFlow()

    val fixtures: List<PreviewFixtureDescriptor> = port.listPreviewFixtures()

    private val _drawerOpen = MutableStateFlow(false)
    val drawerOpen: StateFlow<Boolean> = _drawerOpen.asStateFlow()

    private val _drawerSessions = MutableStateFlow<List<SessionDrawerItem>>(emptyList())
    val drawerSessions: StateFlow<List<SessionDrawerItem>> = _drawerSessions.asStateFlow()

    private val _drawerRefreshing = MutableStateFlow(false)
    val drawerRefreshing: StateFlow<Boolean> = _drawerRefreshing.asStateFlow()

    private val _selectedSessionId = MutableStateFlow<String?>(null)
    val selectedSessionId: StateFlow<String?> = _selectedSessionId.asStateFlow()

    private val _sessionMenuTarget = MutableStateFlow<SessionDrawerItem?>(null)
    val sessionMenuTarget: StateFlow<SessionDrawerItem?> = _sessionMenuTarget.asStateFlow()

    fun selectFixture(fileName: String) {
        viewModelScope.launch {
            port.loadPreviewFixture(fileName)
            syncDrawerFromPort()
            val state = port.sessionState.value
            _drawerOpen.value = state.uiHints.initialDrawerOpen
        }
    }

    fun setDrawerOpen(open: Boolean) {
        _drawerOpen.value = open
    }

    fun refreshDrawerSessions() {
        viewModelScope.launch {
            _drawerRefreshing.value = true
            if (isCorePort) {
                port.refreshSessionList()
            } else {
                delay(600)
                syncDrawerFromPort()
            }
            _drawerRefreshing.value = false
        }
    }

    fun selectSession(id: String) {
        viewModelScope.launch {
            if (isCorePort) {
                port.selectSession(id)
            } else {
                _selectedSessionId.value = id
                _drawerSessions.update { list ->
                    list.map { item -> item.copy(active = item.id == id) }
                }
            }
            _drawerOpen.value = false
        }
    }

    fun isInDraftMode(): Boolean =
        if (isCorePort) {
            port.sessionState.value.sessionDrawer.sessions.none { it.active } &&
                port.sessionState.value.conversation.isEmpty()
        } else {
            _selectedSessionId.value?.startsWith("draft-") == true
        }

    fun startNewConversation(draftTitle: String): Boolean {
        if (isInDraftMode()) {
            _drawerOpen.value = false
            return false
        }
        if (isCorePort) {
            viewModelScope.launch {
                port.beginNewConversation()
            }
            _drawerOpen.value = false
            return true
        }
        val item =
            SessionDrawerItem(
                id = "draft-${UUID.randomUUID()}",
                title = draftTitle,
                time = "刚刚",
                active = true,
            )
        _drawerSessions.update { list ->
            val inactive = list.map { it.copy(active = false) }
            val (pinned, recent) = inactive.partition { it.pinned }
            pinned + item + recent
        }
        _selectedSessionId.value = item.id
        _drawerOpen.value = false
        return true
    }

    fun openSessionMenu(item: SessionDrawerItem) {
        _sessionMenuTarget.value = item
    }

    fun dismissSessionMenu() {
        _sessionMenuTarget.value = null
    }

    fun renameSession(id: String, title: String) {
        viewModelScope.launch {
            if (isCorePort) {
                port.renameSession(id, title)
            } else {
                _drawerSessions.update { list -> list.map { if (it.id == id) it.copy(title = title) else it } }
            }
            dismissSessionMenu()
        }
    }

    fun togglePinSession(id: String) {
        viewModelScope.launch {
            if (isCorePort) {
                port.togglePinSession(id)
            } else {
                _drawerSessions.update { list ->
                    list.map { if (it.id == id) it.copy(pinned = !it.pinned) else it }
                }
            }
            dismissSessionMenu()
        }
    }

    fun deleteSession(id: String) {
        viewModelScope.launch {
            if (isCorePort) {
                port.deleteSession(id)
            } else {
                _drawerSessions.update { list -> list.filterNot { it.id == id } }
            }
            dismissSessionMenu()
        }
    }

    fun onComposerSkillSheetOpen() {
        if (!isCorePort) return
        viewModelScope.launch { catalogPort?.refreshSkillPicker() }
    }

    fun uploadComposerAttachment(
        contentResolver: ContentResolver,
        uri: Uri,
    ) {
        if (!isCorePort) return
        viewModelScope.launch {
            val mime = contentResolver.getType(uri) ?: "application/octet-stream"
            val name = displayNameForUri(contentResolver, uri)
            val bytes =
                contentResolver.openInputStream(uri)?.use { stream -> stream.readBytes() }
                    ?: return@launch
            if (bytes.isEmpty()) return@launch
            port.uploadComposerAttachment(name, bytes, mime, uri.toString())
        }
    }

    private fun displayNameForUri(
        contentResolver: ContentResolver,
        uri: Uri,
    ): String {
        contentResolver.query(uri, null, null, null, null)?.use { cursor ->
            if (cursor.moveToFirst()) {
                val index = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME)
                if (index >= 0) {
                    return cursor.getString(index) ?: "upload.bin"
                }
            }
        }
        return uri.lastPathSegment ?: "upload.bin"
    }

    fun applyPreviewAction(action: PreviewUiAction) {
        when {
            isCorePort && action is PreviewUiAction.AddSkill ->
                port.addComposerSkill(action.skill)
            isCorePort && action is PreviewUiAction.SendComposerText ->
                viewModelScope.launch {
                    port.submitComposerText(
                        action.text,
                        action.modelId,
                        action.reasoningEffort,
                        action.skillNames,
                    )
                }
            isCorePort && action is PreviewUiAction.SubmitClarification ->
                viewModelScope.launch {
                    port.respondClarification(action.answer)
                }
            isCorePort && action is PreviewUiAction.ApproveTools ->
                viewModelScope.launch {
                    port.approveToolCalls()
                }
            isCorePort && action is PreviewUiAction.RejectTools ->
                viewModelScope.launch {
                    port.rejectToolCalls()
                }
            isCorePort && (action is PreviewUiAction.StopRun || action is PreviewUiAction.CancelRun) ->
                viewModelScope.launch {
                    port.cancelActiveRun()
                }
            isCorePort && action is PreviewUiAction.SendFollowUp ->
                viewModelScope.launch {
                    port.sendPendingInput(action.id)
                }
            isCorePort && action is PreviewUiAction.DismissFollowUp ->
                viewModelScope.launch {
                    port.cancelPendingInput(action.id)
                }
            isCorePort && action is PreviewUiAction.RemoveAttachment ->
                port.removeComposerAttachment(action.fileId)
            else -> previewPort?.applyPreviewAction(action)
        }
    }

    private var apiUrlRefreshJob: Job? = null

    fun resetForAuthChange() {
        if (previewPort != null) return
        viewModelScope.launch { port.resetForAuthChange() }
    }

    fun bootstrapCoreConnection() {
        if (previewPort != null) return
        viewModelScope.launch {
            port.refreshReadiness()
            port.refreshPublicConfig()
        }
    }

    fun refreshWorkbench() {
        if (previewPort != null) return
        viewModelScope.launch {
            port.refreshWorkbench()
        }
    }

    fun openWorkbenchPanel() {
        if (previewPort != null) return
        viewModelScope.launch {
            port.openWorkbenchPanel()
        }
    }

    fun focusWorkbenchToolCall(
        runId: String,
        toolCallId: String,
    ) {
        if (previewPort != null) return
        viewModelScope.launch {
            port.focusWorkbenchToolCall(runId, toolCallId)
        }
    }

    fun syncWorkbenchOpenFromUi(open: Boolean) {
        if (previewPort != null) return
        port.setWorkbenchOpen(open)
    }

    fun clearWorkbenchFocusHint() {
        if (previewPort != null) return
        port.clearWorkbenchFocusHint()
    }

    fun loadOlderMessages() {
        if (previewPort != null) return
        val sessionId =
            port.sessionState.value.scenarioId.takeIf { it.isNotBlank() && it != "core-landing" }
                ?: return
        viewModelScope.launch {
            port.loadOlderMessages(sessionId)
        }
    }

    fun scheduleCoreConnectionRefresh() {
        if (previewPort != null) return
        apiUrlRefreshJob?.cancel()
        apiUrlRefreshJob =
            viewModelScope.launch {
                delay(500)
                bootstrapCoreConnection()
            }
    }

    fun onAppBackground() {
        if (previewPort != null) return
        port.onAppBackground()
    }

    fun onAppForeground() {
        if (previewPort != null) return
        viewModelScope.launch {
            port.onAppForeground()
        }
    }

    fun restoreArtifactVersion(
        artifactId: String,
        expectedCurrentArtifactId: String,
    ) {
        if (previewPort != null) return
        viewModelScope.launch {
            port.restoreArtifactVersion(artifactId, expectedCurrentArtifactId)
        }
    }

    fun beginArtifactRevision(artifactId: String) {
        if (previewPort != null) return
        port.beginArtifactRevision(artifactId)
    }

    fun clearComposerRevisionSeed() {
        if (previewPort != null) return
        port.clearComposerRevisionSeed()
    }

    private fun syncDrawerFromPort() {
        val drawer = port.sessionState.value.sessionDrawer.sessions
        _drawerSessions.value = drawer
        _selectedSessionId.value = drawer.firstOrNull { it.active }?.id
    }

    init {
        if (previewPort != null) {
            val default = fixtures.firstOrNull()?.fileName ?: "empty-landing.json"
            selectFixture(default)
        } else {
            viewModelScope.launch {
                port.sessionState.collect {
                    syncDrawerFromPort()
                }
            }
        }
    }
}
