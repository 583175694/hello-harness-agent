import Foundation

struct ComposerModelOption: Identifiable, Equatable {
    let id: String
    let label: String
    let reasoningOptions: [String]
}

enum ComposerCatalogDefaults {
    static let previewModels: [ComposerModelOption] = [
        ComposerModelOption(id: "deepseek-chat", label: "DeepSeek Chat", reasoningOptions: ["off", "low", "high"]),
        ComposerModelOption(id: "deepseek-reasoner", label: "DeepSeek Reasoner", reasoningOptions: ["low", "high", "max"]),
        ComposerModelOption(id: "fast", label: "快速", reasoningOptions: ["off"]),
    ]

    static let previewSkills = ["research", "code-review", "summarize"]
}
