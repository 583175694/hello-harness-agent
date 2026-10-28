import Foundation

enum PreviewUiAction: Equatable {
    case sendComposerText(String)
    case stopRun
    case sendFollowUp(id: String)
    case dismissFollowUp(id: String)
    case submitClarification(String)
    case cancelRun
    case approveTools
    case rejectTools
    case addSkill(String)
    case addAttachment(String)
}
