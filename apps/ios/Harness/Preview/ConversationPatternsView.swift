import SwiftUI

struct ConversationTurnRowView: View {
    let item: ConversationItem
    var onOpenWorkbenchStep: ((String) -> Void)? = nil

    var body: some View {
        switch item {
        case .user(let content):
            UserMessageBubbleView(text: content)
        case .assistant(let status, let pending, let summary, _, let markdown, let process):
            AssistantMessageBubbleView(
                status: status,
                pendingText: pending,
                summary: summary,
                markdownContent: markdown,
                process: process,
                onOpenWorkbenchStep: onOpenWorkbenchStep
            )
        }
    }
}

struct UserMessageBubbleView: View {
    let text: String
    @Environment(\.previewContentFontSize) private var contentFontSize

    var body: some View {
        HStack {
            Spacer(minLength: 48)
            Text(text)
                .font(.system(size: max(13, contentFontSize - 1)))
                .padding(.horizontal, 16)
                .padding(.vertical, 10)
                .background(HarnessColors.userBubble)
                .clipShape(RoundedRectangle(cornerRadius: HarnessLayout.bubbleRadius, style: .continuous))
                .frame(maxWidth: UIScreen.main.bounds.width * 0.82, alignment: .trailing)
        }
    }
}

struct AssistantMessageBubbleView: View {
    let status: String
    let pendingText: String?
    let summary: String?
    let markdownContent: String?
    let process: [ProcessBlock]
    var onOpenWorkbenchStep: ((String) -> Void)? = nil
    @Environment(\.previewContentFontSize) private var contentFontSize

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            AssistantProcessTimelineView(
                blocks: process,
                running: status == "streaming",
                finalOutputVisible: markdownContent != nil || summary != nil,
                onOpenWorkbench: onOpenWorkbenchStep
            )
            if status == "streaming" {
                Text(pendingText?.isEmpty == false ? pendingText! : "▍")
                    .font(.system(size: contentFontSize))
                ProgressView()
            } else if let markdownContent {
                MarkdownBodyView(markdown: markdownContent)
            } else {
                Text(summary ?? "")
                    .font(.system(size: contentFontSize))
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}
