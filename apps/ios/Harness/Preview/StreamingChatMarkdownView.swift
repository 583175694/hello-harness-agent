import SwiftUI

struct StreamingChatMarkdownView: View {
    let markdown: String
    var compact: Bool = false
    var followsProcessTimeline: Bool = false
    var debounceMs: UInt64 = StreamingMarkdown.defaultDebounceMs

    @State private var displayed: String = ""

    var body: some View {
        Group {
            if !displayed.isEmpty {
                ChatMarkdownView(
                    markdown: displayed,
                    compact: compact,
                    followsProcessTimeline: followsProcessTimeline
                )
            }
        }
        .task(id: markdown) {
            if displayed.isEmpty, !markdown.isEmpty {
                displayed = StreamingMarkdown.prepareForParse(markdown)
            }
            try? await Task.sleep(nanoseconds: debounceMs * 1_000_000)
            guard !Task.isCancelled else { return }
            displayed = StreamingMarkdown.prepareForParse(markdown)
        }
    }
}
