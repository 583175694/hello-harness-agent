import Foundation

struct PreviewTransitionBundle: Equatable {
    var afterClarification: PreviewComposerPatch?
    var afterHitlApprove: PreviewComposerPatch?
    var afterHitlReject: PreviewComposerPatch?
}

struct PreviewComposerPatch: Equatable {
    var mode: String?
    var submitting: Bool?
    var composerTextMode: String?
    var showPlan: Bool?
}

extension ComposerState {
    func applying(_ patch: PreviewComposerPatch?) -> ComposerState {
        guard let patch else { return self }
        var copy = self
        if let mode = patch.mode { copy.mode = mode }
        if let submitting = patch.submitting { copy.submitting = submitting }
        if let composerTextMode = patch.composerTextMode { copy.composerTextMode = composerTextMode }
        if let showPlan = patch.showPlan { copy.showPlan = showPlan }
        return copy
    }
}
