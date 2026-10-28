import Foundation

enum ProcessBlock: Equatable {
    case toolActivity(id: String, name: String, summary: String, status: String, duration: String?)
    case reasoning(content: String, durationMs: Int?, streaming: Bool)
    case text(String)
}
