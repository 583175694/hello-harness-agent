import SwiftUI

struct AssistantProcessTimelineView: View {
    let blocks: [ProcessBlock]
    var running: Bool = false
    var finalOutputVisible: Bool = false
    var onOpenWorkbench: ((String) -> Void)? = nil

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
                    withAnimation(.easeOut(duration: 0.22)) {
                        open.toggle()
                    }
                } label: {
                    HStack {
                        Text(headerLabel).font(.subheadline).foregroundStyle(HarnessColors.muted)
                        Spacer()
                        Image(systemName: "chevron.down")
                            .rotationEffect(.degrees(open ? 180 : 0))
                            .animation(.easeOut(duration: 0.14), value: open)
                            .font(.caption)
                            .foregroundStyle(HarnessColors.muted)
                    }
                }
                .buttonStyle(.plain)
                .padding(.vertical, 4)
                if open {
                    VStack(alignment: .leading, spacing: 0) {
                        ForEach(Array(renderable.enumerated()), id: \.offset) { displayIndex, pair in
                            ProcessTimelineRow(
                                block: pair.1,
                                isLast: displayIndex == renderable.count - 1,
                                onOpenWorkbench: onOpenWorkbench
                            )
                        }
                    }
                    .padding(.leading, 4)
                    .transition(
                        .asymmetric(
                            insertion: .opacity.combined(with: .move(edge: .top)),
                            removal: .opacity.combined(with: .move(edge: .top))
                        )
                    )
                }
            }
            .animation(.easeOut(duration: 0.22), value: open)
            .padding(.vertical, 4)
            .onAppear {
                if !userExpanded, finalOutputVisible, !running {
                    DispatchQueue.main.asyncAfter(deadline: .now() + 1) { open = false }
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
    var onOpenWorkbench: ((String) -> Void)? = nil
    @State private var reasoningOpen = false

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
                        HStack(spacing: 6) {
                            Text(name)
                                .font(.subheadline)
                                .foregroundStyle(HarnessColors.secondary)
                                .lineLimit(1)
                            if status == "running" { ProgressView().scaleEffect(0.7) }
                        }
                        .frame(height: 20, alignment: .leading)
                        if !summary.isEmpty, summary != name {
                            Text(summary)
                                .font(.caption)
                                .foregroundStyle(HarnessColors.muted)
                                .lineLimit(1)
                                .padding(.top, 2)
                        }
                    }
                    .contentShape(Rectangle())
                    .onTapGesture {
                        guard let onOpenWorkbench, !id.isEmpty else { return }
                        onOpenWorkbench(id)
                    }
                case .reasoning(let content, let durationMs, let streaming):
                    Button {
                        withAnimation(.easeOut(duration: 0.22)) {
                            reasoningOpen.toggle()
                        }
                    } label: {
                        HStack {
                            Text(ProcessTimelineLabels.reasoningTriggerLabel(streaming: streaming, durationMs: durationMs))
                                .font(.subheadline)
                                .foregroundStyle(HarnessColors.muted)
                                .lineLimit(1)
                            Spacer()
                            Image(systemName: "chevron.down")
                                .font(.system(size: 12, weight: .semibold))
                                .foregroundStyle(HarnessColors.muted)
                                .rotationEffect(.degrees(reasoningOpen || streaming ? 180 : 0))
                                .animation(.easeOut(duration: 0.14), value: reasoningOpen)
                                .accessibilityHidden(true)
                        }
                        .frame(height: 20, alignment: .leading)
                    }
                    .buttonStyle(.plain)
                    if reasoningOpen || streaming {
                        Text(content)
                            .font(.caption)
                            .foregroundStyle(HarnessColors.secondary)
                            .padding(.top, 4)
                            .transition(
                                .asymmetric(
                                    insertion: .opacity.combined(with: .move(edge: .top)),
                                    removal: .opacity.combined(with: .move(edge: .top))
                                )
                            )
                    }
                case .text(let content):
                    Text(content)
                        .font(.caption)
                        .foregroundStyle(HarnessColors.muted)
                        .padding(.vertical, 4)
                }
            }
            .animation(.easeOut(duration: 0.22), value: reasoningOpen)
        }
        .frame(minHeight: 42, alignment: .top)
        .padding(.top, 4)
        .padding(.bottom, 8)
    }

    @ViewBuilder
    private var railIcon: some View {
        switch block {
        case .toolActivity(_, let name, _, let status, _):
            if status == "running" {
                ProgressView().scaleEffect(0.8)
            } else {
                Image(systemName: toolSymbol(name))
                    .font(.system(size: 14))
                    .foregroundStyle(status == "failed" ? HarnessColors.danger : HarnessColors.muted)
            }
        case .reasoning:
            Text("◎").font(.caption).foregroundStyle(HarnessColors.muted)
        case .text:
            Circle().fill(HarnessColors.border).frame(width: 6, height: 6)
        }
    }

    private func toolSymbol(_ name: String) -> String {
        let n = name.lowercased()
        if n.contains("search") || n.contains("fetch") || n.contains("web") { return "magnifyingglass" }
        if n.contains("file") || n.contains("read") { return "doc.text" }
        if n.contains("bash") || n.contains("terminal") { return "terminal" }
        return "clock"
    }
}
