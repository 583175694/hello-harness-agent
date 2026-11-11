package com.harness.agent.preview

/** Gate A 本地交互（无后端）；由 [PreviewSessionReducer] 归约到 [ActiveSessionState]。 */
sealed interface PreviewUiAction {
    data class SendComposerText(
        val text: String,
        val modelId: String? = null,
        val reasoningEffort: String? = null,
        val skillNames: List<String> = emptyList(),
        val onResult: ((Boolean) -> Unit)? = null,
    ) : PreviewUiAction

    data object StopRun : PreviewUiAction

    data class SendFollowUp(val id: String) : PreviewUiAction

    data class DismissFollowUp(val id: String) : PreviewUiAction

    data class SubmitClarification(val answer: String) : PreviewUiAction

    data object CancelRun : PreviewUiAction

    data object ApproveTools : PreviewUiAction

    data object RejectTools : PreviewUiAction

    data class AddSkill(val skill: String) : PreviewUiAction

    data class AddAttachment(val fileName: String) : PreviewUiAction

    data class RemoveAttachment(val fileId: String) : PreviewUiAction
}
