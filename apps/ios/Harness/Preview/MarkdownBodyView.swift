import SwiftUI

struct MarkdownBodyView: View {
    let markdown: String

    var body: some View {
        if let attributed = try? AttributedString(markdown: markdown) {
            Text(attributed)
                .frame(maxWidth: .infinity, alignment: .leading)
        } else {
            Text(markdown)
                .frame(maxWidth: .infinity, alignment: .leading)
        }
    }
}

/// 对话气泡内 Markdown（用户 / 助手正文共用）。
struct ChatMarkdownView: View {
    let markdown: String
    var compact: Bool = false
    @Environment(\.previewContentFontSize) private var contentFontSize

    var body: some View {
        MarkdownBodyView(markdown: markdown)
            .font(.system(size: max(13, contentFontSize)))
            .lineSpacing(HarnessLayout.chatMarkdownLineSpacing(for: max(13, contentFontSize), compact: compact))
            .frame(
                maxWidth: compact ? nil : .infinity,
                alignment: .leading
            )
            .fixedSize(horizontal: compact, vertical: false)
    }
}
