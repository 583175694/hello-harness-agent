import Foundation

enum ProcessTimelineLabels {
    /// 对齐 RN `formatProcessElapsedLabel`（折叠头，中文）
    static func headerLabel(blocks: [ProcessBlock], running: Bool) -> String {
        var ms = 0
        for block in blocks {
            switch block {
            case .reasoning(_, let durationMs, _):
                ms += durationMs ?? 0
            case .toolActivity(_, _, _, _, let duration):
                if let duration {
                    let digits = duration.filter(\.isNumber)
                    if let n = Int(digits) { ms += n * 1000 }
                }
            default: break
            }
        }
        if ms <= 0 { return "处理过程" }
        let totalSeconds = max(0, ms / 1000)
        if totalSeconds < 60 { return "已用时 \(totalSeconds) 秒" }
        return "已用时 \(totalSeconds / 60) 分 \(totalSeconds % 60)秒"
    }

    /// 对齐 RN `reasoningTriggerLabel`（推理行，英文）
    static func reasoningTriggerLabel(streaming: Bool, durationMs: Int?) -> String {
        if streaming { return "Thinking..." }
        if let durationMs {
            let seconds = max(0, durationMs / 1000)
            return "Thought for \(seconds) seconds"
        }
        return "Thought"
    }
}
