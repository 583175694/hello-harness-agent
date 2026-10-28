import Foundation

enum PreviewSessionReducer {
    private static let maxSkills = 6
    private static let maxAttachments = 6

    static func reduce(state: ActiveSessionState, action: PreviewUiAction) -> ActiveSessionState {
        switch action {
        case .sendComposerText(let text):
            return sendText(state: state, text: text)
        case .stopRun:
            return stopRun(state: state)
        case .sendFollowUp(let id):
            return sendFollowUp(state: state, id: id)
        case .dismissFollowUp(let id):
            return dismissFollowUp(state: state, id: id)
        case .submitClarification(let answer):
            return submitClarification(state: state, answer: answer)
        case .cancelRun:
            return cancelRun(state: state)
        case .approveTools:
            return resolveHitl(state: state, approved: true)
        case .rejectTools:
            return resolveHitl(state: state, approved: false)
        case .addSkill(let skill):
            return addSkill(state: state, skill: skill)
        case .addAttachment(let fileName):
            return addAttachment(state: state, fileName: fileName)
        }
    }

    private static func sendText(state: ActiveSessionState, text: String) -> ActiveSessionState {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return state }
        var next = state.appendingUser(trimmed)
        if next.composer.submitting {
            next = next.advancePlanIfNeeded()
        } else {
            next.composer.submitting = true
            next = next.advancePlanIfNeeded()
        }
        return next.syncPeekFromPlan()
    }

    private static func stopRun(state: ActiveSessionState) -> ActiveSessionState {
        var next = state
        if next.composer.composerTextMode == "disabled" {
            next.composer.composerTextMode = "new-run"
        }
        next.composer.submitting = false
        next.chrome.peekBarTitle = nil
        next.chrome.peekBarSubtitle = nil
        next.chrome.runSummary = nil
        return next
    }

    private static func cancelRun(state: ActiveSessionState) -> ActiveSessionState {
        var base = state
        base.composer.mode = "default"
        base.composer.clarification = nil
        base.composer.toolApproval = nil
        base.composer.composerTextMode = "new-run"
        return stopRun(state: base)
    }

    private static func sendFollowUp(state: ActiveSessionState, id: String) -> ActiveSessionState {
        guard let item = state.composer.followUps.first(where: { $0.id == id }) else { return state }
        var next = state
        next.composer.followUps.removeAll { $0.id == id }
        return sendText(state: next, text: item.content)
    }

    private static func dismissFollowUp(state: ActiveSessionState, id: String) -> ActiveSessionState {
        var next = state
        next.composer.followUps.removeAll { $0.id == id }
        return next
    }

    private static func submitClarification(state: ActiveSessionState, answer: String) -> ActiveSessionState {
        let trimmed = answer.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return state }
        let patch = state.previewTransitions?.afterClarification ?? defaultAfterClarification()
        var next = state.appendingUser(trimmed)
        next.composer.mode = "default"
        next.composer.clarification = nil
        next.composer = next.composer.applying(patch)
        return next.syncPeekFromPlan()
    }

    private static func resolveHitl(state: ActiveSessionState, approved: Bool) -> ActiveSessionState {
        let patch: PreviewComposerPatch
        if approved {
            patch = state.previewTransitions?.afterHitlApprove ?? defaultAfterHitlApprove()
        } else {
            patch = state.previewTransitions?.afterHitlReject ?? defaultAfterHitlReject()
        }
        var next = state.appendingUser(approved ? "已批准工具执行（Preview）" : "已拒绝工具执行（Preview）")
        next.composer.mode = "default"
        next.composer.toolApproval = nil
        next.composer = next.composer.applying(patch)
        return next.syncPeekFromPlan()
    }

    private static func addSkill(state: ActiveSessionState, skill: String) -> ActiveSessionState {
        var normalized = skill.trimmingCharacters(in: .whitespacesAndNewlines)
        if normalized.hasPrefix("/") { normalized.removeFirst() }
        guard !normalized.isEmpty else { return state }
        var next = state
        guard !next.composer.selectedSkills.contains(normalized),
              next.composer.selectedSkills.count < maxSkills else { return state }
        next.composer.selectedSkills.append(normalized)
        return next
    }

    private static func addAttachment(state: ActiveSessionState, fileName: String) -> ActiveSessionState {
        let name = fileName.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !name.isEmpty else { return state }
        var next = state
        guard !next.composer.attachmentNames.contains(name),
              next.composer.attachmentNames.count < maxAttachments else { return state }
        next.composer.attachmentNames.append(name)
        return next
    }

    private static func defaultAfterClarification() -> PreviewComposerPatch {
        PreviewComposerPatch(mode: "default", submitting: true, composerTextMode: "new-run", showPlan: nil)
    }

    private static func defaultAfterHitlApprove() -> PreviewComposerPatch {
        PreviewComposerPatch(mode: "default", submitting: true, composerTextMode: "steer", showPlan: nil)
    }

    private static func defaultAfterHitlReject() -> PreviewComposerPatch {
        PreviewComposerPatch(mode: "default", submitting: false, composerTextMode: "new-run", showPlan: nil)
    }
}

private extension ActiveSessionState {
    func appendingUser(_ content: String) -> ActiveSessionState {
        var copy = self
        copy.conversation.append(.user(content))
        return copy
    }

    func advancePlanIfNeeded() -> ActiveSessionState {
        guard composer.showPlan, var plan = composer.plan, !plan.steps.isEmpty else { return self }
        var steps = plan.steps
        if let activeIdx = steps.firstIndex(where: { $0.status == "in_progress" }) {
            steps[activeIdx].status = "completed"
            if let nextPending = steps.firstIndex(where: { $0.status == "pending" }) {
                steps[nextPending].status = "in_progress"
            }
        } else if let firstPending = steps.firstIndex(where: { $0.status == "pending" }) {
            steps[firstPending].status = "in_progress"
        }
        plan.steps = steps
        var copy = self
        copy.composer.plan = plan
        return copy
    }

    func syncPeekFromPlan() -> ActiveSessionState {
        if composer.showPlan {
            var copy = self
            copy.chrome.peekBarTitle = nil
            copy.chrome.peekBarSubtitle = nil
            return copy
        }
        guard composer.submitting, let plan = composer.plan, !plan.steps.isEmpty else { return self }
        let steps = plan.steps
        let activeIdx =
            steps.firstIndex(where: { $0.status == "in_progress" })
            ?? max(steps.lastIndex(where: { $0.status == "completed" }) ?? 0, 0)
        let stepNumber = min(activeIdx + 1, steps.count)
        let title = steps[activeIdx].step
        var copy = self
        copy.chrome.peekBarTitle = title
        copy.chrome.peekBarSubtitle = "步骤 \(stepNumber) / \(steps.count)"
        return copy
    }
}
