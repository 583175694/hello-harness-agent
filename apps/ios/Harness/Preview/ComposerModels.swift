import Foundation

struct ComposerState: Equatable {
    var mode: String = "default"
    var composerTextMode: String = "new-run"
    var submitting: Bool = false
    var clarification: ClarificationFixture?
    var toolApproval: ToolApprovalFixture?
    var selectedSkills: [String] = []
    var showPlan: Bool = false
    var plan: PlanFixture?
    var attachmentNames: [String] = []
    var selectedModelLabel: String = "默认模型"
    var followUps: [FollowUpFixture] = []
}

struct FollowUpFixture: Equatable, Identifiable {
    var id: String
    var content: String
}

struct PlanFixture: Equatable {
    var explanation: String?
    var steps: [PlanStepFixture] = []
    var initialExpanded: Bool = false
}

struct PlanStepFixture: Equatable, Identifiable {
    var step: String
    var status: String = "pending"
    var id: String { step + status }
}

struct ClarificationFixture: Equatable {
    var question: String
    var options: [String] = []
    var allowFreeText: Bool = true
}

struct ToolApprovalFixture: Equatable {
    var title: String = "需要批准工具调用"
    var items: [ToolApprovalItemFixture] = []
    var sandboxNote: String?
}

struct ToolApprovalItemFixture: Equatable, Identifiable {
    var itemId: String
    var toolName: String
    var command: String
    var id: String { itemId }
}
