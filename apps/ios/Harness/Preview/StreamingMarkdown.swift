import Foundation

/// 流式 Markdown 预处理（与 KMP `StreamingMarkdown` 保持逻辑一致）。
enum StreamingMarkdown {
    static let defaultDebounceMs: UInt64 = 120

    static func prepareForParse(_ source: String) -> String {
        guard !source.isEmpty else { return source }
        var text = closeOpenFencedCodeBlocks(source)
        text = stripTrailingUnpairedDoubleAsterisk(text)
        return text
    }

    static func closeOpenFencedCodeBlocks(_ source: String) -> String {
        var fenceLines = 0
        for line in source.split(separator: "\n", omittingEmptySubsequences: false) {
            if line.trimmingCharacters(in: .whitespaces).hasPrefix("```") {
                fenceLines += 1
            }
        }
        if fenceLines % 2 == 0 { return source }
        return source + "\n```"
    }

    static func stripTrailingUnpairedDoubleAsterisk(_ source: String) -> String {
        var pairs = 0
        var i = source.startIndex
        while i < source.endIndex {
            let next = source.index(after: i)
            if next < source.endIndex, source[i] == "*", source[next] == "*" {
                pairs += 1
                i = source.index(after: next)
            } else {
                i = next
            }
        }
        if pairs % 2 == 0 { return source }
        guard let last = source.range(of: "**", options: .backwards) else { return source }
        return String(source[..<last.lowerBound])
    }
}
