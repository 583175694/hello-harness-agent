import SwiftUI

// Gate A: 来源在 activity 内 relatedSources / WorkbenchSourceCard；文件经 deliverableFiles + previewMarkdown。

struct WorkbenchSheetView: View {
    var previewReduceMotion: Bool = false
    @Environment(\.accessibilityReduceMotion) private var accessibilityReduceMotion
    let visible: Bool
    let state: WorkbenchState

    private var reduceMotion: Bool { previewReduceMotion || accessibilityReduceMotion }
    let onDismiss: () -> Void
    @State private var presentProgress: CGFloat = 0
    var onOpenReportReader: (() -> Void)? = nil
    var onOpenArtifactReader: (() -> Void)? = nil
    var onOpenFilePreview: ((String, String) -> Void)? = nil
    var initialFocusedToolId: String? = nil
    @State private var detentIndex: Int
    @State private var activeTab: String
    @State private var passageCard: WorkbenchSourceCard?
    @State private var restoreConfirm: AppConfirmRequest?

    init(
        previewReduceMotion: Bool = false,
        visible: Bool = true,
        state: WorkbenchState,
        onDismiss: @escaping () -> Void,
        onOpenReportReader: (() -> Void)? = nil,
        onOpenArtifactReader: (() -> Void)? = nil,
        onOpenFilePreview: ((String, String) -> Void)? = nil,
        initialFocusedToolId: String? = nil
    ) {
        self.previewReduceMotion = previewReduceMotion
        self.visible = visible
        self.state = state
        self.initialFocusedToolId = initialFocusedToolId
        self.onDismiss = onDismiss
        self.onOpenReportReader = onOpenReportReader
        self.onOpenArtifactReader = onOpenArtifactReader
        self.onOpenFilePreview = onOpenFilePreview
        _detentIndex = State(initialValue: state.resolvedInitialDetent)
        _activeTab = State(initialValue: state.initialView)
        _presentProgress = State(initialValue: visible ? 1 : 0)
    }

    private let detents: [CGFloat] = [0.44, 0.72, 0.98]

    var body: some View {
        Group {
        if presentProgress <= 0.01 && !visible {
            Color.clear
        } else {
        GeometryReader { geo in
            let bottomInset = geo.safeAreaInsets.bottom
            let sheetHeight = geo.size.height * detents[detentIndex] - bottomInset
            ZStack(alignment: .bottom) {
                Color.black
                    .opacity((reduceMotion ? 0.5 : 0.35) * Double(presentProgress))
                    .ignoresSafeArea()
                    .onTapGesture(perform: onDismiss)
                VStack(spacing: 0) {
                    Capsule()
                        .fill(HarnessColors.border)
                        .frame(width: 36, height: 4)
                        .padding(.top, 8)
                        .onTapGesture { detentIndex = (detentIndex + 1) % detents.count }
                    HStack {
                        Text("工作台").font(.headline)
                        Spacer()
                        Button("关闭", action: onDismiss)
                    }
                    .padding(.horizontal, 12)
                    tabBar
                    tabBody
                        .frame(maxHeight: .infinity)
                }
                .frame(height: max(sheetHeight, 0))
                .frame(maxWidth: .infinity)
                .background(HarnessColors.surface)
                .clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
                .offset(y: (1 - presentProgress) * (sheetHeight + bottomInset))
                .padding(.bottom, bottomInset)
                .opacity(Double(presentProgress))
            }
        }
        }
    }
        .onAppear {
            animatePresent(to: visible)
        }
        .onChange(of: visible) { _, open in
            animatePresent(to: open)
        }
        .onChange(of: initialFocusedToolId) { _, newId in
            if newId != nil { activeTab = "activity" }
        }
        .ignoresSafeArea()
        .sheet(item: $passageCard) { card in
            NavigationStack {
                ScrollView {
                    VStack(alignment: .leading, spacing: 8) {
                        if let heading = card.passageHeading {
                            Text(heading).font(.caption).foregroundStyle(HarnessColors.muted)
                        }
                        Text(card.passageBody ?? "").font(.body)
                    }
                    .padding()
                }
                .navigationTitle(card.title)
                .toolbar {
                    ToolbarItem(placement: .confirmationAction) {
                        Button("关闭") { passageCard = nil }
                    }
                }
            }
            .presentationDetents([.medium])
        }
        .appConfirmDialog($restoreConfirm)
    }

    private func animatePresent(to open: Bool) {
        let duration = reduceMotion ? 0.0 : 0.28
        if reduceMotion {
            presentProgress = open ? 1 : 0
            return
        }
        withAnimation(.easeOut(duration: duration)) {
            presentProgress = open ? 1 : 0
        }
    }

    private func workbenchTabLabel(_ tab: String) -> String {
        switch tab {
        case "activity": return "实时跟随"
        case "artifact": return "文件"
        default: return tab
        }
    }

    private var tabBar: some View {
        let tabs = ["activity", "artifact"]
        return HarnessSlidingSegmentedControl(
            options: tabs,
            selection: $activeTab,
            label: workbenchTabLabel
        )
        .padding(.horizontal, 12)
        .padding(.vertical, 6)
    }

    @ViewBuilder
    private var tabBody: some View {
        if activeTab == "artifact" {
            ScrollView {
                WorkbenchFilesView(
                    files: state.deliverableFiles,
                    onPreview: { file in
                        let md = file.previewMarkdown ?? "# \(file.fileName)\n\n（Preview 文件预览）"
                        if let onOpenFilePreview {
                            onOpenFilePreview(file.fileName, md)
                        } else {
                            onOpenReportReader?()
                        }
                    }
                )
                .padding(.vertical, 8)
            }
        } else {
            WorkbenchActivityFollowView(state: state, initialStepId: initialFocusedToolId)
        }
    }
}

// MARK: - Activity follow（步骤条 + 工具详情，对齐 Android / Web）

struct WorkbenchActivityFollowView: View {
    let state: WorkbenchState
    var initialStepId: String? = nil
    @State private var stepIndex: Int = 0

    var body: some View {
        let executions = state.toolExecutions
        if executions.isEmpty {
            WorkbenchTabEmptyStateView(
                title: "暂无过程记录",
                message: "助手的检索、读取与命令执行会显示在这里。"
            )
        } else {
            let idx = min(max(stepIndex, 0), executions.count - 1)
            let tool = executions[idx]
            let sources = relatedSources(for: tool)
            VStack(spacing: 0) {
                ScrollView {
                    ToolExecutionDetailView(tool: tool, sources: sources)
                        .padding(16)
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                Divider().overlay(HarnessColors.composerBorder)
                WorkbenchStepFooterView(
                    stepIndex: idx,
                    stepCount: executions.count,
                    onStepIndexChange: { stepIndex = $0 }
                )
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
            .onAppear { stepIndex = resolvedStepIndex(in: executions) }
            .onChange(of: initialStepId) { _, _ in
                stepIndex = resolvedStepIndex(in: executions)
            }
        }
    }

    private func resolvedStepIndex(in executions: [WorkbenchToolExecution]) -> Int {
        if let initialStepId, let found = executions.firstIndex(where: { $0.id == initialStepId }) {
            return found
        }
        if let running = executions.lastIndex(where: { $0.status == "running" }) {
            return running
        }
        return max(executions.count - 1, 0)
    }

    private func relatedSources(for tool: WorkbenchToolExecution) -> [WorkbenchSourceCard] {
        if !tool.linkedSourceIndexes.isEmpty {
            return tool.linkedSourceIndexes.compactMap { state.sources[safe: $0] }
        }
        if tool.toolName == "web_search" || tool.toolName == "web_fetch" {
            return state.sources
        }
        return []
    }
}

private struct ToolExecutionDetailView: View {
    let tool: WorkbenchToolExecution
    let sources: [WorkbenchSourceCard]

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Text(tool.title.isEmpty ? tool.toolName : tool.title).font(.headline)
                Spacer()
                if let elapsed = tool.elapsed {
                    Text(elapsed).font(.caption).foregroundStyle(HarnessColors.muted)
                }
            }
            Text(tool.toolName).font(.caption).foregroundStyle(HarnessColors.muted)
            if !tool.inputSummary.isEmpty {
                Text("输入").font(.caption2).foregroundStyle(HarnessColors.muted)
                Text(tool.inputSummary)
                    .font(.body)
                    .padding(12)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(HarnessColors.subtle)
                    .clipShape(RoundedRectangle(cornerRadius: HarnessLayout.panelRadius, style: .continuous))
            }
            let trimmedBash = tool.bashOutput?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
            let bodyText: String = {
                if !trimmedBash.isEmpty { return trimmedBash }
                if let out = tool.outputSummary, !out.isEmpty { return out }
                if let d = tool.detail, !d.isEmpty { return d }
                return "执行中，结果尚未生成"
            }()
            if tool.toolName == "bash" || tool.bashOutput != nil {
                Text(bodyText)
                    .font(.caption.monospaced())
                    .padding(12)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(HarnessColors.subtle)
                    .clipShape(RoundedRectangle(cornerRadius: HarnessLayout.panelRadius, style: .continuous))
            } else {
                Text("结果").font(.caption2).foregroundStyle(HarnessColors.muted)
                Text(bodyText)
                    .font(.body)
                    .padding(12)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(HarnessColors.subtle)
                    .clipShape(RoundedRectangle(cornerRadius: HarnessLayout.panelRadius, style: .continuous))
            }
            if !sources.isEmpty {
                Text("关联来源").font(.caption2).foregroundStyle(HarnessColors.muted)
                ForEach(sources) { card in
                    VStack(alignment: .leading, spacing: 4) {
                        Text(card.title).font(.subheadline.weight(.medium))
                        Text(card.url).font(.caption).foregroundStyle(HarnessColors.link)
                        if !card.snippet.isEmpty {
                            Text(card.snippet).font(.caption).foregroundStyle(HarnessColors.muted)
                        }
                    }
                    .padding(12)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .overlay(
                        RoundedRectangle(cornerRadius: HarnessLayout.panelRadius, style: .continuous)
                            .stroke(HarnessColors.composerBorder, lineWidth: 1)
                    )
                }
            }
        }
    }
}

private struct WorkbenchStepFooterView: View {
    let stepIndex: Int
    let stepCount: Int
    let onStepIndexChange: (Int) -> Void

    var body: some View {
        let maxIndex = max(stepCount - 1, 0)
        VStack(alignment: .leading, spacing: HarnessLayout.workbenchStepFooterContentGap) {
            Text("步骤 \(stepIndex + 1) / \(stepCount)")
                .font(.caption)
                .monospacedDigit()
                .foregroundStyle(HarnessColors.muted)
            HStack(spacing: HarnessLayout.workbenchStepFooterContentGap) {
                WorkbenchStepNavButton(
                    systemName: "chevron.left",
                    accessibilityLabel: "上一步",
                    enabled: stepIndex > 0,
                    action: { onStepIndexChange(max(stepIndex - 1, 0)) }
                )
                WorkbenchStepSlider(
                    stepIndex: stepIndex,
                    stepCount: stepCount,
                    onStepIndexChange: onStepIndexChange
                )
                .accessibilityLabel("步骤 \(stepIndex + 1)，共 \(stepCount)")
                WorkbenchStepNavButton(
                    systemName: "chevron.right",
                    accessibilityLabel: "下一步",
                    enabled: stepIndex < maxIndex,
                    action: { onStepIndexChange(min(stepIndex + 1, maxIndex)) }
                )
            }
        }
        .padding(.top, HarnessLayout.workbenchStepFooterTopPadding)
        .padding(.horizontal, HarnessLayout.workbenchStepFooterHorizontalPadding)
        .padding(.bottom, HarnessLayout.workbenchStepFooterBottomPadding)
        .background(HarnessColors.surface)
    }
}

/// 对齐 Web `.ui-slider`：细轨道 + 描边圆拇指，无系统刻度/竖线。
private struct WorkbenchStepSlider: View {
    let stepIndex: Int
    let stepCount: Int
    let onStepIndexChange: (Int) -> Void

    private let trackHeight: CGFloat = 5
    private let thumbSize: CGFloat = 16
    private let thumbBorder: CGFloat = 2

    var body: some View {
        let maxIndex = max(stepCount - 1, 0)
        let fraction = maxIndex > 0 ? CGFloat(stepIndex) / CGFloat(maxIndex) : 0
        GeometryReader { geo in
            let width = geo.size.width
            let thumbRadius = thumbSize / 2
            let trackWidth = max(width - thumbSize, 0)
            let thumbX = thumbRadius + trackWidth * fraction
            ZStack(alignment: .leading) {
                Capsule()
                    .fill(HarnessColors.composerBorder)
                    .frame(height: trackHeight)
                    .padding(.horizontal, thumbRadius)
                Capsule()
                    .fill(HarnessColors.primary)
                    .frame(width: max(thumbX - thumbRadius, 0), height: trackHeight)
                    .padding(.leading, thumbRadius)
                Circle()
                    .fill(HarnessColors.surface)
                    .overlay(
                        Circle().stroke(HarnessColors.primary, lineWidth: thumbBorder)
                    )
                    .frame(width: thumbSize, height: thumbSize)
                    .position(x: thumbX, y: geo.size.height / 2)
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .contentShape(Rectangle())
            .gesture(
                DragGesture(minimumDistance: 0)
                    .onChanged { value in
                        let inner = max(width - thumbSize, 1)
                        let f = min(max((value.location.x - thumbRadius) / inner, 0), 1)
                        let next = Int((f * CGFloat(maxIndex)).rounded())
                        onStepIndexChange(min(max(next, 0), maxIndex))
                    }
            )
        }
        .frame(height: 22)
    }
}

private struct WorkbenchStepNavButton: View {
    let systemName: String
    let accessibilityLabel: String
    let enabled: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Image(systemName: systemName)
                .font(.system(size: 18, weight: .semibold))
                .frame(width: HarnessLayout.iconToolbarSize, height: HarnessLayout.iconToolbarSize)
        }
        .buttonStyle(.plain)
        .disabled(!enabled)
        .opacity(enabled ? 1 : 0.38)
        .accessibilityLabel(accessibilityLabel)
    }
}

struct WorkbenchFilesView: View {
    let files: [WorkbenchDeliverableFile]
    let onPreview: (WorkbenchDeliverableFile) -> Void

    var body: some View {
        if files.isEmpty {
            WorkbenchTabEmptyStateView(
                title: "暂无文件",
                message: "运行完成后，报告与导出文件会显示在这里。"
            )
        } else {
        VStack(spacing: 10) {
            ForEach(files) { file in
                HStack {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(file.fileName).font(.body)
                        if !file.subtitle.isEmpty {
                            Text(file.subtitle).font(.caption).foregroundStyle(HarnessColors.muted)
                        }
                    }
                    Spacer()
                    Button {
                        onPreview(file)
                    } label: {
                        Image(systemName: "eye")
                    }
                    .accessibilityLabel("预览 \(file.fileName)")
                }
                .padding(.horizontal, 14)
                .padding(.vertical, 12)
                .overlay(
                    RoundedRectangle(cornerRadius: HarnessLayout.panelRadius, style: .continuous)
                        .stroke(HarnessColors.composerBorder, lineWidth: 1)
                )
            }
        }
        .padding(.horizontal, 16)
        }
    }
}

struct WorkbenchTabEmptyStateView: View {
    let title: String
    let message: String

    var body: some View {
        VStack(spacing: 8) {
            Text(title).font(.body.weight(.medium))
            Text(message)
                .font(.caption)
                .foregroundStyle(HarnessColors.muted)
                .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .padding(.horizontal, 16)
        .padding(.vertical, 48)
    }
}

private extension Array {
    subscript(safe index: Int) -> Element? {
        indices.contains(index) ? self[index] : nil
    }
}

/// Gate A Snapshot：Sources Passage 半屏（UI 回归 #14）。
struct WorkbenchPassageSheetSnapshotView: View {
    let card: WorkbenchSourceCard

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 8) {
                    if let heading = card.passageHeading {
                        Text(heading).font(.caption).foregroundStyle(HarnessColors.muted)
                    }
                    Text(card.passageBody ?? "").font(.body)
                }
                .padding()
            }
            .navigationTitle(card.title)
        }
    }
}

/// Gate A Snapshot：Artifact 恢复确认（S-WB-ART 静态确认）。
struct WorkbenchRestoreConfirmSnapshotView: View {
    let message: String

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("恢复版本").font(.headline)
            Text(message).font(.body)
            HStack {
                Spacer()
                Button("取消") {}
                Button("确认恢复", role: .destructive) {}
            }
        }
        .padding(20)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(HarnessColors.surface)
    }
}

/// 对齐 RN `SlidingSegmentTrack` / Android `HarnessSegmentedControl`（240ms ease-out 滑动高亮）。
struct HarnessSlidingSegmentedControl<Option: Hashable>: View {
    let options: [Option]
    @Binding var selection: Option
    let label: (Option) -> String
    var previewReduceMotion: Bool = false

    @Environment(\.accessibilityReduceMotion) private var accessibilityReduceMotion

    private var reduceMotion: Bool { previewReduceMotion || accessibilityReduceMotion }

    var body: some View {
        GeometryReader { proxy in
            let count = max(options.count, 1)
            let segmentWidth = proxy.size.width / CGFloat(count)
            let index = CGFloat(options.firstIndex(of: selection) ?? 0)

            ZStack(alignment: .leading) {
                RoundedRectangle(cornerRadius: 6, style: .continuous)
                    .fill(HarnessColors.primary)
                    .frame(width: segmentWidth, height: proxy.size.height)
                    .offset(x: segmentWidth * index)
                    .animation(reduceMotion ? nil : .easeOut(duration: 0.24), value: selection)

                HStack(spacing: 0) {
                    ForEach(options, id: \.self) { option in
                        let selected = option == selection
                        Button {
                            selection = option
                        } label: {
                            Text(label(option))
                                .font(.caption.weight(selected ? .semibold : .regular))
                                .foregroundStyle(selected ? HarnessColors.primaryForeground : HarnessColors.secondary)
                                .frame(maxWidth: .infinity, maxHeight: .infinity)
                        }
                        .buttonStyle(.plain)
                        .frame(width: segmentWidth)
                    }
                }
            }
        }
        .frame(height: 34)
        .padding(4)
        .background(HarnessColors.subtle)
        .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
    }
}
