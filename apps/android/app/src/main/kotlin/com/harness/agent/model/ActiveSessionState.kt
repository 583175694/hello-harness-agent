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
    val canLoadOlderMessages: Boolean = false,
    val loadingOlderMessages: Boolean = false,
    val canLoadOlderSessionSummaries: Boolean = false,
    val loadingOlderSessionSummaries: Boolean = false,
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
    abstract val id: String

    data class User(
        override val id: String,
        val content: String,
        val attachments: List<UserAttachmentItem> = emptyList(),
    ) : ConversationItem()

    data class Assistant(
        override val id: String,
        val deliveryStatus: String = "completed",
        /** 对齐 Web `item.pending`（Run 进行中 assistant）。 */
        val pending: Boolean = false,
        val pendingText: String? = null,
        /** Run 进行中已产生的 final 段落（与 pending 可同时展示）。 */
        val finalText: String? = null,
        val summary: String? = null,
        /** ReplayController 目标全文；展示从空 tail 开始增长。 */
        val tailTarget: String? = null,
        /** 完成态 Markdown（流式阶段仍为纯 Text）。 */
        val markdownContent: String? = null,
        val process: List<ProcessBlock> = emptyList(),
        val artifacts: List<ArtifactItem> = emptyList(),
    ) : ConversationItem()
}


data class ArtifactItem(
    val artifactId: String,
    val fileId: String,
    val fileName: String,
    val mediaType: String = "text/plain",
    val fileKind: String = "text",
    val size: Int = 0,
    val status: String = "ready",
    val seriesId: String? = null,
    val versionNumber: Int? = null,
    val isCurrent: Boolean? = null,
) {
    val id: String get() = artifactId
}
