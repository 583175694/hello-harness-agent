package com.harness.agent.preview

/** Gate A 本地交互（无后端）；由 [PreviewSessionReducer] 归约到 [ActiveSessionState]。 */
sealed interface PreviewUiAction {
    data class SendComposerText(val text: String) : PreviewUiAction

    data object StopRun : PreviewUiAction

    data class SendFollowUp(val id: String) : PreviewUiAction

    data class DismissFollowUp(val id: String) : PreviewUiAction

    data class SubmitClarification(val answer: String) : PreviewUiAction

    data object CancelRun : PreviewUiAction

    data object ApproveTools : PreviewUiAction

    data object RejectTools : PreviewUiAction

    data class AddSkill(val skill: String) : PreviewUiAction

    data class AddAttachment(val fileName: String) : PreviewUiAction
}
