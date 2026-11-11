package com.harness.agent.model

/** Fixture `previewTransitions`：HITL / 澄清后的 composer 补丁（Phase A 本地态）。 */
data class PreviewTransitionBundle(
    val afterClarification: PreviewComposerPatch? = null,
    val afterHitlApprove: PreviewComposerPatch? = null,
    val afterHitlReject: PreviewComposerPatch? = null,
)

data class PreviewComposerPatch(
    val mode: String? = null,
    val submitting: Boolean? = null,
    val composerTextMode: String? = null,
    val showPlan: Boolean? = null,
)

fun ComposerState.applyPreviewPatch(patch: PreviewComposerPatch?): ComposerState {
    if (patch == null) return this
    return copy(
        mode = patch.mode ?: mode,
        submitting = patch.submitting ?: submitting,
        composerTextMode = patch.composerTextMode ?: composerTextMode,
        showPlan = patch.showPlan ?: showPlan,
    )
}
