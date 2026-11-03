import SwiftUI

/// 时间线 disclosure：无背景，仅 label 透明度变化。
private struct ProcessTimelineTextButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .opacity(configuration.isPressed ? 0.72 : 1)
    }
}

struct AssistantProcessTimelineView: View {
    let blocks: [ProcessBlock]
    var running: Bool = false
    var finalOutputVisible: Bool = false
    var onOpenWorkbench: ((String) -> Void)? = nil
    var previewReduceMotion: Bool = false

    @State private var open = true
    @State private var userExpanded = false

    private var renderable: [(Int, ProcessBlock)] {
        blocks.enumerated().compactMap { index, block in
            switch block {
            case .reasoning, .toolActivity:
                return (index, block)
            case .text(let content):
                return content.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? nil : (index, block)
            }
        }
    }

    var body: some View {
        if renderable.isEmpty {
            EmptyView()
        } else {
            VStack(alignment: .leading, spacing: 0) {
                Button {
                    userExpanded = true
                    open.toggle()
                } label: {
                    HStack(spacing: 6) {
                        Text(headerLabel).font(.subheadline).foregroundStyle(HarnessColors.muted)
                        HarnessSymbol.image("chevron.down", size: 14)
                            .rotationEffect(.degrees(open ? 180 : 0))
                            .foregroundStyle(HarnessColors.muted)
                    }
                }
                .buttonStyle(ProcessTimelineTextButtonStyle())
                .padding(.vertical, 4)
                VStack(alignment: .leading, spacing: 0) {
                    ForEach(Array(renderable.enumerated()), id: \.offset) { displayIndex, pair in
                        ProcessTimelineRow(
                            block: pair.1,
                            isLast: displayIndex == renderable.count - 1,
                            reduceMotion: previewReduceMotion,
                            onOpenWorkbench: onOpenWorkbench
                        )
                    }
                }
                .padding(.leading, 4)
                .scaleEffect(x: 1, y: open ? 1 : 0, anchor: .top)
                .opacity(open ? 1 : 0)
                .animation(previewReduceMotion ? nil : .easeOut(duration: 0.22), value: open)
                .accessibilityHidden(!open)
            }
            .padding(.vertical, 4)
            .clipped()
            .onAppear {
                if !userExpanded, finalOutputVisible, !running {
                    DispatchQueue.main.asyncAfter(deadline: .now() + 1) {
                        guard !userExpanded, finalOutputVisible, !running else { return }
                        open = false
                    }
                }
                if running { open = true }
            }
        }
    }

    private var headerLabel: String {
        ProcessTimelineLabels.headerLabel(blocks: blocks, running: running)
    }
}

private struct ProcessTimelineRow: View {
    let block: ProcessBlock
    let isLast: Bool
    var reduceMotion: Bool = false
    var onOpenWorkbench: ((String) -> Void)? = nil
    @Environment(\.accessibilityReduceMotion) private var accessibilityReduceMotion
    @State private var reasoningOpen = false
    @State private var reasoningAutoCloseTask: Task<Void, Never>?

    private var prefersReducedMotion: Bool { reduceMotion || accessibilityReduceMotion }

    private static let reasoningAutoCloseNanos: UInt64 = 1_000_000_000

    var body: some View {
        HStack(alignment: .top, spacing: 8) {
            VStack(spacing: 0) {
                railIcon
                    .frame(height: 20)
                if !isLast {
                    Rectangle()
                        .fill(HarnessColors.border)
                        .frame(width: 1)
                        .frame(maxHeight: .infinity)
                        .padding(.top, 2)
                }
            }
            .frame(width: 22)
            VStack(alignment: .leading, spacing: 0) {
                switch block {
                case .toolActivity(let id, let name, let summary, let status, _):
                    Group {
                        ToolActivityInlineLabelView(toolName: name, title: name, summary: summary)
                            .frame(height: 20, alignment: .leading)
                    }
                    .contentShape(Rectangle())
                    .onTapGesture {
                        guard let onOpenWorkbench, !id.isEmpty else { return }
                        onOpenWorkbench(id)
                    }
                case .reasoning(let content, let durationMs, let streaming):
                    VStack(alignment: .leading, spacing: 0) {
                        Button {
                            toggleReasoningOpen()
                        } label: {
                            HStack(spacing: 6) {
                                Text(ProcessTimelineLabels.reasoningTriggerLabel(streaming: streaming, durationMs: durationMs))
                                    .font(.subheadline)
                                    .foregroundStyle(HarnessColors.muted)
                                    .lineLimit(1)
                                HarnessSymbol.image("chevron.down", size: 14)
                                    .foregroundStyle(HarnessColors.muted)
                                    .rotationEffect(.degrees(reasoningOpen ? 180 : 0))
                                    .animation(prefersReducedMotion ? nil : .easeOut(duration: 0.14), value: reasoningOpen)
                                    .accessibilityHidden(true)
                            }
                            .frame(height: 20, alignment: .leading)
                        }
                        .buttonStyle(ProcessTimelineTextButtonStyle())
                        ProcessTimelineReasoningScrollBody(
                            content: content,
                            streaming: streaming,
                            reduceMotion: prefersReducedMotion
                        )
                        .scaleEffect(x: 1, y: reasoningOpen ? 1 : 0, anchor: .top)
                        .opacity(reasoningOpen ? 1 : 0)
                        .animation(prefersReducedMotion ? nil : .easeOut(duration: 0.22), value: reasoningOpen)
                        .accessibilityHidden(!reasoningOpen)
                    }
                    .clipped()
                    .onAppear {
                        if streaming {
                            reasoningOpen = true
                        }
                    }
                    .onChange(of: streaming) { wasStreaming, isStreaming in
                        reasoningAutoCloseTask?.cancel()
                        reasoningAutoCloseTask = nil
                        if isStreaming {
                            if prefersReducedMotion {
                                reasoningOpen = true
                            } else {
                                withAnimation(.easeOut(duration: 0.22)) {
                                    reasoningOpen = true
                                }
                            }
                        } else if wasStreaming {
                            reasoningAutoCloseTask = Task {
                                try? await Task.sleep(nanoseconds: Self.reasoningAutoCloseNanos)
                                guard !Task.isCancelled else { return }
                                await MainActor.run {
                                    if prefersReducedMotion {
                                        reasoningOpen = false
                                    } else {
                                        withAnimation(.easeOut(duration: 0.22)) {
                                            reasoningOpen = false
                                        }
                                    }
                                }
                            }
                        }
                    }
                    .onDisappear {
                        reasoningAutoCloseTask?.cancel()
                        reasoningAutoCloseTask = nil
                    }
                case .text(let content):
                    Text(content)
                        .font(.subheadline)
                        .foregroundStyle(HarnessColors.secondary)
                        .lineSpacing(4)
                        .padding(.vertical, 4)
                }
            }
        }
        .frame(minHeight: 42, alignment: .top)
        .padding(.top, 4)
        .padding(.bottom, 8)
    }

    private func toggleReasoningOpen() {
        if prefersReducedMotion {
            reasoningOpen.toggle()
        } else {
            withAnimation(.easeOut(duration: 0.22)) {
                reasoningOpen.toggle()
            }
        }
    }

    @ViewBuilder
    private var railIcon: some View {
        switch block {
        case .toolActivity(_, let name, _, let status, _):
            HarnessSymbol.image(ProcessTimelineLabels.toolRailSymbolName(toolName: name), size: 15)
                .foregroundStyle(status == "failed" ? HarnessColors.danger : (status == "running" ? HarnessColors.link : HarnessColors.muted))
        case .reasoning, .text:
            ProcessTimelineNodeDot()
        }
    }
}

private struct ProcessTimelineNodeDot: View {
    var body: some View {
        Circle().fill(HarnessColors.border).frame(width: 6, height: 6)
    }
}

/// 对齐 Web `.ai-reasoning__content`：限高、内部滚动、上下渐变遮罩。
private struct ProcessTimelineReasoningScrollBody: View {
    let content: String
    let streaming: Bool
    var reduceMotion: Bool = false

    private let maxHeight: CGFloat = 240
    private let fadeHeight: CGFloat = 18

    @Environment(\.colorScheme) private var colorScheme

    var body: some View {
        let fadeBase = HarnessColors.canvas(colorScheme)
        ScrollViewReader { proxy in
            ScrollView {
                Text(content)
                    .font(.subheadline)
                    .foregroundStyle(HarnessColors.muted)
                    .lineSpacing(6)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .id("reasoningScrollEnd")
            }
            .frame(maxHeight: maxHeight)
            .padding(.top, 6)
            .padding(.horizontal, 12)
            .padding(.bottom, 8)
            .scrollIndicators(.hidden)
            .overlay(alignment: .top) {
                LinearGradient(
                    colors: [fadeBase, fadeBase.opacity(0)],
                    startPoint: .top,
                    endPoint: .bottom
                )
                .frame(height: fadeHeight)
                .allowsHitTesting(false)
            }
            .overlay(alignment: .bottom) {
                LinearGradient(
                    colors: [fadeBase.opacity(0), fadeBase],
                    startPoint: .top,
                    endPoint: .bottom
                )
                .frame(height: fadeHeight)
                .allowsHitTesting(false)
            }
            .onChange(of: content) { _, _ in
                guard streaming else { return }
                if reduceMotion {
                    proxy.scrollTo("reasoningScrollEnd", anchor: .bottom)
                } else {
                    withAnimation(.easeOut(duration: 0.15)) {
                        proxy.scrollTo("reasoningScrollEnd", anchor: .bottom)
                    }
                }
            }
        }
    }
}

struct ToolActivityInlineLabelView: View {
    let toolName: String
    let title: String
    let summary: String

    private var inlineSummary: String? {
        ProcessTimelineLabels.toolActivityInlineSummary(toolName: toolName, title: title, summary: summary)
    }

    var body: some View {
        if let inlineSummary {
            HStack(spacing: 0) {
                Text(title)
                    .font(.subheadline)
                    .foregroundStyle(HarnessColors.muted)
                    .lineLimit(1)
                    .layoutPriority(1)
                Text("|")
                    .font(.subheadline)
                    .foregroundStyle(HarnessColors.muted.opacity(0.45))
                    .padding(.horizontal, 6)
                Text(inlineSummary)
                    .font(.subheadline)
                    .foregroundStyle(HarnessColors.muted)
                    .lineLimit(1)
                    .layoutPriority(-1)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        } else {
            Text(ProcessTimelineLabels.toolActivityPrimaryLine(toolName: toolName, title: title, summary: summary))
                .font(.subheadline)
                .foregroundStyle(HarnessColors.muted)
                .lineLimit(1)
                .frame(maxWidth: .infinity, alignment: .leading)
        }
    }
}
