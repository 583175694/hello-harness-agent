#if CORE_PORT
import Foundation

extension ActiveSessionState {
    func withComposerSkills(_ skills: [String]) -> ActiveSessionState {
        var copy = self
        copy.composer.selectedSkills = skills
        return copy
    }

    func withComposerAttachments(_ items: [ComposerAttachmentItem]) -> ActiveSessionState {
        var copy = self
        copy.composer.attachmentItems = items
        copy.composer.attachmentNames = items.map(\.fileName)
        return copy
    }
}
#endif
