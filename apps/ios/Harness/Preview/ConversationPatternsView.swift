import SwiftUI

struct ConversationTurnRowView: View {
    let item: ConversationItem
    var previewReduceMotion: Bool = false
    var onOpenWorkbenchStep: ((String) -> Void)? = nil

    var body: some View {
        switch item {
        case .user(let content, _):
            UserMessageBubbleView(text: content)
        case .assistant(let status, let pending, let pendingText, let finalText, let summary, _, let markdown, let process):
            AssistantMessageBubbleView(
                status: status,
                pending: pending,
                pendingText: pendingText,
                finalText: finalText,
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
    let pending: Bool
    let pendingText: String?
    let finalText: String?
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

    private var runInProgress: Bool {
        pending || status == "streaming"
    }

    private var hasProcess: Bool {
        !process.isEmpty
    }

    private var hasVisibleProcess: Bool {
        process.contains { block in
            switch block {
            case .reasoning(let content, _, _): return !content.isEmpty
            case .toolActivity: return true
            case .text(let content): return !content.isEmpty
            }
        }
    }

    private var trimmedPending: String? {
        guard let pendingText else { return nil }
        let t = pendingText.trimmingCharacters(in: .whitespacesAndNewlines)
        return t.isEmpty ? nil : t
    }

    private var trimmedFinal: String? {
        guard let finalText else { return nil }
        let t = finalText.trimmingCharacters(in: .whitespacesAndNewlines)
        return t.isEmpty ? nil : t
    }

    private var hasVisibleOutput: Bool {
        trimmedPending != nil || trimmedFinal != nil
    }

    private var assistantFinalOutputVisible: Bool {
        hasVisibleOutput || !assistantBodyMarkdown.isEmpty
    }

    private var deliveryExtraTop: CGFloat {
        hasProcess ? HarnessLayout.chatAssistantDeliveryExtraTop : 0
    }

    var body: some View {
        VStack(alignment: .leading, spacing: HarnessLayout.chatAssistantSectionGap) {
            if hasProcess || runInProgress {
                AssistantProcessTimelineView(
                    blocks: process,
                    running: runInProgress,
                    finalOutputVisible: assistantFinalOutputVisible,
                    onOpenWorkbench: onOpenWorkbenchStep,
                    previewReduceMotion: previewReduceMotion
                )
            }
            if runInProgress {
                if hasVisibleOutput {
                    AssistantDeliveryStack(extraTop: deliveryExtraTop) {
                        if let pending = trimmedPending {
                            StreamingChatMarkdownView(
                                markdown: pending,
                                followsProcessTimeline: hasProcess && trimmedFinal == nil
                            )
                        }
                        if let final = trimmedFinal {
                            StreamingChatMarkdownView(
                                markdown: final,
                                followsProcessTimeline: hasProcess && trimmedPending == nil
                            )
                        }
                    }
                }
                if !hasVisibleProcess && !hasVisibleOutput {
                    Text("正在思考")
                        .font(.system(size: contentFontSize))
                }
            } else {
                AssistantDeliveryStack(extraTop: deliveryExtraTop) {
                    ChatMarkdownView(
                        markdown: assistantBodyMarkdown,
                        followsProcessTimeline: hasProcess
                    )
                }
            }
        }
        .padding(.vertical, HarnessLayout.chatTurnVerticalPadding)
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

private struct AssistantDeliveryStack<Content: View>: View {
    let extraTop: CGFloat
    @ViewBuilder let content: Content

    var body: some View {
        VStack(alignment: .leading, spacing: HarnessLayout.chatAssistantSectionGap) {
            content
        }
        .padding(.top, extraTop)
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}
