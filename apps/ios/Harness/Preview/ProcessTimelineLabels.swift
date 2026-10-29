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

    static func toolActivityInlineSummary(toolName: String, title: String, summary: String) -> String? {
        if summary.isEmpty || summary == title { return nil }
        let n = toolName.lowercased()
        if n == "web_search" || n == "web_fetch" { return nil }
        if n.contains("bash") || n.contains("command") || n.contains("terminal") { return nil }
        return summary
    }

    static func toolActivityPrimaryLine(toolName: String, title: String, summary: String) -> String {
        if toolActivityInlineSummary(toolName: toolName, title: title, summary: summary) != nil {
            return title.isEmpty ? "tool" : title
        }
        let n = toolName.lowercased()
        if (n == "web_search" || n == "web_fetch"), !summary.isEmpty, summary != title {
            return "搜索：\(summary)"
        }
        return title.isEmpty ? "tool" : title
    }

    /// 对齐 `@harness/agent-conversation` `processTimelineToolIconKind` → SF Symbol
    static func toolRailSymbolName(toolName: String) -> String {
        if toolName == "web_search" || toolName == "web_fetch" { return "magnifyingglass" }
        if toolName == "search_file" || toolName == "read_file" || toolName == "read_file_lines" {
            return "doc.text.magnifyingglass"
        }
        if toolName == "create_file" || toolName == "create_report" { return "doc.text" }
        if toolName == "bash" { return "terminal" }
        if toolName == "get_current_time" || toolName == "execute_command" { return "clock" }
        if toolName.hasPrefix("mcp__") { return "cable.connector" }
        return "clock"
    }
}
