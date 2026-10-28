package com.harness.agent.model

data class SessionDrawerItem(
    val id: String,
    val title: String,
    val time: String,
    val active: Boolean = false,
    val pinned: Boolean = false,
    val running: Boolean = false,
)

data class SessionDrawerState(
    val draftTitle: String = "新对话",
    val searchPlaceholder: String = "搜索会话",
    val sessions: List<SessionDrawerItem> = emptyList(),
)

data class UiHints(
    val initialDrawerOpen: Boolean = false,
)
