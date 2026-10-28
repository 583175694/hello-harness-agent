package com.harness.agent.preview

import com.harness.agent.model.ActiveSessionState
import com.harness.agent.model.ConversationItem
import com.harness.agent.model.PreviewComposerPatch
import com.harness.agent.model.applyPreviewPatch

object PreviewSessionReducer {
    private const val MAX_SKILLS = 6
    private const val MAX_ATTACHMENTS = 6

    fun reduce(
        state: ActiveSessionState,
        action: PreviewUiAction,
    ): ActiveSessionState =
        when (action) {
            is PreviewUiAction.SendComposerText -> sendText(state, action.text)
            PreviewUiAction.StopRun -> stopRun(state)
            is PreviewUiAction.SendFollowUp -> sendFollowUp(state, action.id)
            is PreviewUiAction.DismissFollowUp -> dismissFollowUp(state, action.id)
            is PreviewUiAction.SubmitClarification -> submitClarification(state, action.answer)
            PreviewUiAction.CancelRun -> cancelRun(state)
            PreviewUiAction.ApproveTools -> resolveHitl(state, approved = true)
            PreviewUiAction.RejectTools -> resolveHitl(state, approved = false)
            is PreviewUiAction.AddSkill -> addSkill(state, action.skill)
            is PreviewUiAction.AddAttachment -> addAttachment(state, action.fileName)
        }

    private fun sendText(
        state: ActiveSessionState,
        raw: String,
    ): ActiveSessionState {
        val text = raw.trim()
        if (text.isEmpty()) return state
        var next = state.appendUser(text)
        val composer = next.composer
        next =
            if (composer.submitting) {
                next.advancePlanIfNeeded()
            } else {
                next
                    .copy(composer = composer.copy(submitting = true))
                    .advancePlanIfNeeded()
            }
        return next.syncPeekFromPlan()
    }

    private fun stopRun(state: ActiveSessionState): ActiveSessionState {
        val mode = state.composer.composerTextMode
        val nextMode =
            when (mode) {
                "disabled" -> "new-run"
                else -> mode
            }
        return state.copy(
            composer =
                state.composer.copy(
                    submitting = false,
                    composerTextMode = nextMode,
                ),
            chrome =
                state.chrome.copy(
                    peekBarTitle = null,
                    peekBarSubtitle = null,
                    runSummary = null,
                ),
        )
    }

    private fun cancelRun(state: ActiveSessionState): ActiveSessionState =
        stopRun(
            state.copy(
                composer =
                    state.composer.copy(
                        mode = "default",
                        clarification = null,
                        toolApproval = null,
                        composerTextMode = "new-run",
                    ),
            ),
        )

    private fun sendFollowUp(
        state: ActiveSessionState,
        id: String,
    ): ActiveSessionState {
        val item = state.composer.followUps.find { it.id == id } ?: return state
        val remaining = state.composer.followUps.filterNot { it.id == id }
        return sendText(
            state.copy(composer = state.composer.copy(followUps = remaining)),
            item.content,
        )
    }

    private fun dismissFollowUp(
        state: ActiveSessionState,
        id: String,
    ): ActiveSessionState {
        val remaining = state.composer.followUps.filterNot { it.id == id }
        if (remaining.size == state.composer.followUps.size) return state
        return state.copy(composer = state.composer.copy(followUps = remaining))
    }

    private fun submitClarification(
        state: ActiveSessionState,
        answer: String,
    ): ActiveSessionState {
        val text = answer.trim()
        if (text.isEmpty()) return state
        val patch = state.previewTransitions?.afterClarification
        val cleared =
            state.composer.copy(
                mode = "default",
                clarification = null,
            )
        val composer = cleared.applyPreviewPatch(patch ?: defaultAfterClarification())
        return state.appendUser(text).copy(composer = composer).syncPeekFromPlan()
    }

    private fun resolveHitl(
        state: ActiveSessionState,
        approved: Boolean,
    ): ActiveSessionState {
        val patch =
            if (approved) {
                state.previewTransitions?.afterHitlApprove
            } else {
                state.previewTransitions?.afterHitlReject
            }
        val default =
            if (approved) {
                defaultAfterHitlApprove()
            } else {
                defaultAfterHitlReject()
            }
        val composer =
            state.composer
                .copy(
                    mode = "default",
                    toolApproval = null,
                ).applyPreviewPatch(patch ?: default)
        val message =
            if (approved) {
                "已批准工具执行（Preview）"
            } else {
                "已拒绝工具执行（Preview）"
            }
        return state.appendUser(message).copy(composer = composer).syncPeekFromPlan()
    }

    private fun addSkill(
        state: ActiveSessionState,
        skill: String,
    ): ActiveSessionState {
        val normalized = skill.trim().removePrefix("/")
        if (normalized.isEmpty()) return state
        val current = state.composer.selectedSkills
        if (current.contains(normalized) || current.size >= MAX_SKILLS) return state
        return state.copy(
            composer = state.composer.copy(selectedSkills = current + normalized),
        )
    }

    private fun addAttachment(
        state: ActiveSessionState,
        fileName: String,
    ): ActiveSessionState {
        val name = fileName.trim()
        if (name.isEmpty()) return state
        val current = state.composer.attachmentNames
        if (current.contains(name) || current.size >= MAX_ATTACHMENTS) return state
        return state.copy(
            composer = state.composer.copy(attachmentNames = current + name),
        )
    }

    private fun ActiveSessionState.appendUser(content: String): ActiveSessionState =
        copy(conversation = conversation + ConversationItem.User(content))

    private fun ActiveSessionState.advancePlanIfNeeded(): ActiveSessionState {
        val plan = composer.plan ?: return this
        if (!composer.showPlan || plan.steps.isEmpty()) return this
        val steps = plan.steps.toMutableList()
        val activeIdx = steps.indexOfFirst { it.status == "in_progress" }
        if (activeIdx < 0) {
            val firstPending = steps.indexOfFirst { it.status == "pending" }
            if (firstPending < 0) return this
            steps[firstPending] = steps[firstPending].copy(status = "in_progress")
        } else {
            steps[activeIdx] = steps[activeIdx].copy(status = "completed")
            val nextPending = steps.indexOfFirst { it.status == "pending" }
            if (nextPending >= 0) {
                steps[nextPending] = steps[nextPending].copy(status = "in_progress")
            }
        }
        return copy(composer = composer.copy(plan = plan.copy(steps = steps)))
    }

    private fun ActiveSessionState.syncPeekFromPlan(): ActiveSessionState {
        if (composer.showPlan) {
            return if (chrome.peekBarTitle != null || chrome.peekBarSubtitle != null) {
                copy(chrome = chrome.copy(peekBarTitle = null, peekBarSubtitle = null))
            } else {
                this
            }
        }
        val plan = composer.plan
        if (!composer.submitting || plan == null || plan.steps.isEmpty()) {
            return this
        }
        val steps = plan.steps
        val activeIdx =
            steps.indexOfFirst { it.status == "in_progress" }.takeIf { it >= 0 }
                ?: steps.indexOfLast { it.status == "completed" }.coerceAtLeast(0)
        val stepNumber = (activeIdx + 1).coerceAtMost(steps.size)
        val title = steps.getOrNull(activeIdx)?.step ?: composer.plan?.explanation ?: "执行中"
        return copy(
            chrome =
                chrome.copy(
                    peekBarTitle = title,
                    peekBarSubtitle = "步骤 $stepNumber / ${steps.size}",
                ),
        )
    }

    private fun defaultAfterClarification(): PreviewComposerPatch =
        PreviewComposerPatch(
            mode = "default",
            submitting = true,
            composerTextMode = "new-run",
        )

    private fun defaultAfterHitlApprove(): PreviewComposerPatch =
        PreviewComposerPatch(
            mode = "default",
            submitting = true,
            composerTextMode = "steer",
        )

    private fun defaultAfterHitlReject(): PreviewComposerPatch =
        PreviewComposerPatch(
            mode = "default",
            submitting = false,
            composerTextMode = "new-run",
        )
}
