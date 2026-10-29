import SwiftUI

struct ConversationTurnRowView: View {
    let item: ConversationItem
    var previewReduceMotion: Bool = false
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
                previewReduceMotion: previewReduceMotion,
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
            ChatMarkdownView(markdown: text, compact: true)
                .padding(.horizontal, HarnessLayout.chatBubblePaddingHorizontal)
                .padding(.vertical, HarnessLayout.chatBubblePaddingVertical)
                .background(HarnessColors.userBubble)
                .clipShape(RoundedRectangle(cornerRadius: HarnessLayout.bubbleRadius, style: .continuous))
                .frame(maxWidth: HarnessLayout.userBubbleMaxWidth, alignment: .trailing)
        }
        .padding(.vertical, HarnessLayout.chatTurnVerticalPadding)
    }
}

struct AssistantMessageBubbleView: View {
    let status: String
    let pendingText: String?
    let summary: String?
    let markdownContent: String?
    let process: [ProcessBlock]
    var previewReduceMotion: Bool = false
    var onOpenWorkbenchStep: ((String) -> Void)? = nil
    @Environment(\.previewContentFontSize) private var contentFontSize

    private var assistantBodyMarkdown: String {
        if let markdownContent, !markdownContent.isEmpty { return markdownContent }
        return summary ?? ""
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            AssistantProcessTimelineView(
                blocks: process,
                running: status == "streaming",
                finalOutputVisible: !assistantBodyMarkdown.isEmpty,
                onOpenWorkbench: onOpenWorkbenchStep,
                previewReduceMotion: previewReduceMotion
            )
            if status == "streaming" {
                Text(pendingText?.isEmpty == false ? pendingText! : "▍")
                    .font(.system(size: contentFontSize))
            } else {
                ChatMarkdownView(markdown: assistantBodyMarkdown)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
        }
        .padding(.vertical, HarnessLayout.chatTurnVerticalPadding)
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}
