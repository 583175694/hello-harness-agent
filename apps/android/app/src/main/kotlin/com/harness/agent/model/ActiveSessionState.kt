package com.harness.agent.model

data class ActiveSessionState(
    val schemaVersion: Int = 1,
    val scenarioId: String = "empty-landing",
    val title: String = "新对话",
    val conversation: List<ConversationItem> = emptyList(),
    val composer: ComposerState = ComposerState(),
    val chrome: ChromeState = ChromeState(),
    val problemTitle: String? = null,
    val problemDetail: String? = null,
    val sessionDrawer: SessionDrawerState = SessionDrawerState(),
    val uiHints: UiHints = UiHints(),
    val replay: ReplayConfig? = null,
    val workbench: WorkbenchState = WorkbenchState(),
    val previewTransitions: PreviewTransitionBundle? = null,
)

data class ReplayConfig(
    val tickMs: Long = 100,
    val codepointsPerTick: Int = 6,
)

data class ChromeState(
    val connectionState: String = "idle",
    val serviceState: String = "ready",
    val runSummary: String? = null,
    val peekBarTitle: String? = null,
    val peekBarSubtitle: String? = null,
)

sealed class ConversationItem {
    data class User(val content: String) : ConversationItem()

    data class Assistant(
        val deliveryStatus: String = "completed",
        val pendingText: String? = null,
        val summary: String? = null,
        /** ReplayController 目标全文；展示从空 tail 开始增长。 */
        val tailTarget: String? = null,
        /** 完成态 Markdown（流式阶段仍为纯 Text）。 */
        val markdownContent: String? = null,
        val process: List<ProcessBlock> = emptyList(),
    ) : ConversationItem()
}
