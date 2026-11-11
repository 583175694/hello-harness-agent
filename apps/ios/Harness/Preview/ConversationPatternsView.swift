import SwiftUI

struct ConversationTurnRowView: View {
    let item: ConversationItem
    var previewReduceMotion: Bool = false
    var onOpenWorkbenchStep: ((String) -> Void)? = nil
    var onOpenArtifact: ((ArtifactItem) -> Void)? = nil

    var body: some View {
        switch item {
        case .user(_, let content, let attachments):
            UserMessageBubbleView(text: content, attachments: attachments)
        case .assistant(_, let status, let pending, let pendingText, let finalText, let summary, _, let markdown, let process, let artifacts):
            AssistantMessageBubbleView(
                status: status,
                pending: pending,
                pendingText: pendingText,
                finalText: finalText,
                summary: summary,
                markdownContent: markdown,
                process: process,
                artifacts: artifacts,
                previewReduceMotion: previewReduceMotion,
                onOpenWorkbenchStep: onOpenWorkbenchStep,
                onOpenArtifact: onOpenArtifact
            )
        }
    }
}

struct UserMessageBubbleView: View {
    let text: String
    var attachments: [UserAttachmentItem] = []
    @Environment(\.previewContentFontSize) private var contentFontSize

    var body: some View {
        HStack {
            Spacer(minLength: 48)
            VStack(alignment: .trailing, spacing: 6) {
                if !attachments.isEmpty {
                    HStack(spacing: 6) {
                        ForEach(attachments, id: \.fileId) { attachment in
                            UserAttachmentThumbnailView(attachment: attachment)
                        }
                    }
                }
                if !text.isEmpty {
                    ChatMarkdownView(markdown: text, compact: true)
                }
            }
            .padding(.horizontal, HarnessLayout.chatBubblePaddingHorizontal)
            .padding(.vertical, HarnessLayout.chatBubblePaddingVertical)
            .background(HarnessColors.userBubble)
            .clipShape(RoundedRectangle(cornerRadius: HarnessLayout.bubbleRadius, style: .continuous))
            .frame(maxWidth: HarnessLayout.userBubbleMaxWidth, alignment: .trailing)
        }
        .padding(.vertical, HarnessLayout.chatTurnVerticalPadding)
    }
}

private struct UserAttachmentThumbnailView: View {
    let attachment: UserAttachmentItem
    private let size: CGFloat = 52

    private var isImage: Bool {
        let lower = attachment.fileName.lowercased()
        return lower.hasSuffix(".png") || lower.hasSuffix(".jpg") || lower.hasSuffix(".jpeg") ||
            lower.hasSuffix(".webp")
    }

    var body: some View {
        if isImage, let url = PreviewImageURL.resolve(attachment.previewUrl) {
            ComposerAuthedImage(url: url)
                .frame(width: size, height: size)
                .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
        } else {
            HStack(spacing: 6) {
                Text(fileExtensionLabel)
                    .font(.system(size: 9, weight: .bold))
                    .foregroundStyle(HarnessColors.link)
                Text(attachment.fileName)
                    .font(.caption)
                    .lineLimit(1)
            }
            .padding(.horizontal, 8)
            .frame(height: size)
            .background(HarnessColors.surface)
            .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
        }
    }

    private var fileExtensionLabel: String {
        guard let dot = attachment.fileName.lastIndex(of: ".") else { return "FILE" }
        return String(attachment.fileName[attachment.fileName.index(after: dot)...]).uppercased().prefix(4).description
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
    var artifacts: [ArtifactItem] = []
    var previewReduceMotion: Bool = false
    var onOpenWorkbenchStep: ((String) -> Void)? = nil
    var onOpenArtifact: ((ArtifactItem) -> Void)? = nil
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
            case .reasoning(_, let content, _, _): return !content.isEmpty
            case .toolActivity: return true
            case .text(_, let content): return !content.isEmpty
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
            if !artifacts.isEmpty {
                VStack(spacing: 8) {
                    ForEach(artifacts) { artifact in
                        Button { onOpenArtifact?(artifact) } label: {
                            HStack(spacing: 10) {
                                Text(artifact.fileKind.uppercased().prefix(4))
                                    .font(.caption2.weight(.bold))
                                    .foregroundStyle(HarnessColors.link)
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(artifact.fileName)
                                        .font(.subheadline.weight(.medium))
                                        .foregroundStyle(HarnessColors.primary)
                                        .lineLimit(1)
                                    Text(
                                        [
                                            artifact.fileKind,
                                            artifact.versionNumber.map { "v\($0)" },
                                            artifact.status,
                                            artifact.isCurrent == true ? "当前版本" : nil
                                        ].compactMap { $0 }.joined(separator: " · ")
                                    )
                                    .font(.caption)
                                    .foregroundStyle(HarnessColors.muted)
                                    .lineLimit(1)
                                }
                                Spacer(minLength: 4)
                                Text("打开")
                                    .font(.caption)
                                    .foregroundStyle(HarnessColors.link)
                            }
                            .padding(.horizontal, 12)
                            .padding(.vertical, 10)
                            .background(HarnessColors.surface)
                            .clipShape(RoundedRectangle(cornerRadius: HarnessLayout.panelRadius, style: .continuous))
                            .overlay(
                                RoundedRectangle(cornerRadius: HarnessLayout.panelRadius, style: .continuous)
                                    .stroke(HarnessColors.composerBorder)
                            )
                        }
                        .buttonStyle(HarnessPressScaleButtonStyle())
                        .disabled(onOpenArtifact == nil)
                    }
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
