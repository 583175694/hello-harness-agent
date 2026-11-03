import MarkdownUI
import SwiftUI

struct MarkdownBodyView: View {
    let markdown: String
    var contentFontSize: CGFloat = 14
    @Environment(\.colorScheme) private var colorScheme

    var body: some View {
        Markdown(markdown)
            .markdownTheme(.harnessChat(colorScheme: colorScheme, contentFontSize: contentFontSize))
            .textSelection(.enabled)
            .frame(maxWidth: .infinity, alignment: .leading)
    }
}

/// 对话气泡内 Markdown（用户 / 助手正文共用）。
struct ChatMarkdownView: View {
    let markdown: String
    var compact: Bool = false
    /// 紧接 Process 时间线后的交付正文：首段略增顶距（对齐 Android `followsProcessTimeline`）。
    var followsProcessTimeline: Bool = false
    @Environment(\.previewContentFontSize) private var contentFontSize

    var body: some View {
        MarkdownBodyView(
            markdown: markdown,
            contentFontSize: max(13, contentFontSize),
        )
            .padding(.top, followsProcessTimeline ? 4 : 0)
            .frame(
                maxWidth: compact ? nil : .infinity,
                alignment: .leading
            )
            .fixedSize(horizontal: compact, vertical: false)
    }
}
