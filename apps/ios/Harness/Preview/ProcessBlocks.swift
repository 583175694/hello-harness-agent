import Foundation

enum ProcessBlock: Equatable {
    case toolActivity(id: String, name: String, summary: String, status: String, duration: String?)
    case reasoning(id: String, content: String, durationMs: Int?, streaming: Bool)
    case text(id: String, content: String)

    var explicitId: String? {
        switch self {
        case .toolActivity(let id, _, _, _, _):
            return id.isEmpty ? nil : "tool:\(id)"
        case .reasoning(let id, _, _, _):
            return id.isEmpty ? nil : "reasoning:\(id)"
        case .text(let id, _):
            return id.isEmpty ? nil : "text:\(id)"
        }
    }
}
