package com.harness.agent.preview

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.harness.agent.model.ActiveSessionState
import com.harness.agent.model.SessionDrawerItem
import com.harness.agent.port.AgentSessionPort
import com.harness.agent.port.PreviewFixtureDescriptor
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

class PreviewSessionViewModel(
    private val port: AgentSessionPort,
) : ViewModel() {
    private val previewPort: PreviewAgentSessionPort?
        get() = port as? PreviewAgentSessionPort
    val sessionState: StateFlow<ActiveSessionState> = port.sessionState

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
            val state = port.sessionState.value
            _drawerSessions.value = state.sessionDrawer.sessions
            _drawerOpen.value = state.uiHints.initialDrawerOpen
            _selectedSessionId.value = state.sessionDrawer.sessions.firstOrNull { it.active }?.id
        }
    }

    fun setDrawerOpen(open: Boolean) {
        _drawerOpen.value = open
    }

    fun refreshDrawerSessions() {
        viewModelScope.launch {
            _drawerRefreshing.value = true
            delay(600)
            _drawerSessions.value = port.sessionState.value.sessionDrawer.sessions
            _drawerRefreshing.value = false
        }
    }

    fun selectSession(id: String) {
        _selectedSessionId.value = id
        _drawerSessions.update { list ->
            list.map { it.copy(active = it.id == id) }
        }
        _drawerOpen.value = false
    }

    fun openSessionMenu(item: SessionDrawerItem) {
        _sessionMenuTarget.value = item
    }

    fun dismissSessionMenu() {
        _sessionMenuTarget.value = null
    }

    fun renameSession(id: String, title: String) {
        _drawerSessions.update { list -> list.map { if (it.id == id) it.copy(title = title) else it } }
        dismissSessionMenu()
    }

    fun togglePinSession(id: String) {
        _drawerSessions.update { list ->
            list.map { if (it.id == id) it.copy(pinned = !it.pinned) else it }
        }
        dismissSessionMenu()
    }

    fun deleteSession(id: String) {
        _drawerSessions.update { list -> list.filterNot { it.id == id } }
        dismissSessionMenu()
    }

    fun applyPreviewAction(action: PreviewUiAction) {
        previewPort?.applyPreviewAction(action)
    }

    init {
        val default = fixtures.firstOrNull()?.fileName ?: "empty-landing.json"
        selectFixture(default)
    }
}
