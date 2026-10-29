import SwiftUI

private enum PreviewChromeFlags {
    static let showPlanOverlay = false
}

struct PreviewChatShellView: View {
    @Bindable var store: PreviewSessionStore
    let fixtureFileName: String
    @Bindable var preferences: PreviewAppPreferences
    var onOpenSettings: () -> Void
    var onOpenLogin: () -> Void = {}
    var onOpenReportReader: (String, String) -> Void
    var onOpenArtifactReader: (String, String) -> Void = { _, _ in }
    var onLoadDemoFixture: () -> Void = {}
    /// 快照测试：禁止 onAppear 自动展开 Workbench。
    var suppressAutoWorkbench: Bool = false
    /// 快照测试：固定 Workbench 初始展开（与 suppressAutoWorkbench 联用）。
    var initialWorkbenchOpen: Bool = false
    @State private var workbenchOpen: Bool
    @State private var focusedToolStepId: String?
    @State private var serviceBannerDismissed = false
    @State private var composerChromeHeight: CGFloat = 0

    init(
        store: PreviewSessionStore,
        fixtureFileName: String,
        preferences: PreviewAppPreferences,
        onOpenSettings: @escaping () -> Void,
        onOpenLogin: @escaping () -> Void = {},
        onOpenReportReader: @escaping (String, String) -> Void,
        onOpenArtifactReader: @escaping (String, String) -> Void = { _, _ in },
        onLoadDemoFixture: @escaping () -> Void = {},
        suppressAutoWorkbench: Bool = false,
        initialWorkbenchOpen: Bool = false
    ) {
        self.store = store
        self.fixtureFileName = fixtureFileName
        self.preferences = preferences
        self.onOpenSettings = onOpenSettings
        self.onOpenLogin = onOpenLogin
        self.onOpenReportReader = onOpenReportReader
        self.onOpenArtifactReader = onOpenArtifactReader
        self.onLoadDemoFixture = onLoadDemoFixture
        self.suppressAutoWorkbench = suppressAutoWorkbench
        self.initialWorkbenchOpen = initialWorkbenchOpen
        _workbenchOpen = State(initialValue: initialWorkbenchOpen)
    }

    var body: some View {
        ZStack {
            VStack(spacing: 0) {
                ChatTopBarView(
                    title: store.session.title,
                    connectionState: store.session.chrome.connectionState,
                    runSummary: store.session.chrome.runSummary,
                    workbenchBadge: store.session.workbench.workbenchCount,
                    onOpenDrawer: {
                        PreviewKeyboardDismiss.run()
                        store.drawerOpen = true
                    },
                    onOpenWorkbench: {
                        PreviewKeyboardDismiss.run()
                        workbenchOpen = true
                    }
                )

                ZStack {
                    VStack(spacing: 0) {
                        if !serviceBannerDismissed && store.session.chrome.serviceState != "ready" {
                            ServiceBannerView(
                                serviceState: store.session.chrome.serviceState,
                                onRetry: { serviceBannerDismissed = false },
                                onDismiss: { serviceBannerDismissed = true }
                            )
                        }
                        if store.session.chrome.serviceState == "ready" {
                            ProblemDetailsCardView(
                                title: store.session.problemTitle,
                                detail: store.session.problemDetail
                            )
                        }

                        Group {
                            if store.session.conversation.isEmpty {
                                VStack(spacing: 16) {
                                    HStack(spacing: 14) {
                                        BrandIconView(size: 40)
                                        Text(HarnessCopy.newSessionWelcome)
                                            .font(.system(size: 18, weight: .medium))
                                    }
                                    if store.session.scenarioId == "empty-landing" {
                                        Button(action: onLoadDemoFixture) {
                                            Text("加载演示 Mock（对话 + 工作台）")
                                                .font(.body)
                                                .foregroundStyle(HarnessColors.link)
                                        }
                                        .buttonStyle(.plain)
                                        .accessibilityIdentifier("landing-load-demo-mock")
                                        Text("或：设置 → 演示场景")
                                            .font(.caption)
                                            .foregroundStyle(HarnessColors.muted)
                                    }
                                }
                                .frame(maxWidth: .infinity, maxHeight: .infinity)
                            } else {
                                ScrollViewReader { proxy in
                                    ScrollView {
                                        LazyVStack(spacing: HarnessLayout.chatListTurnSpacing) {
                                            ForEach(Array(store.session.conversation.enumerated()), id: \.offset) { idx, item in
                                                ConversationTurnRowView(
                                                    item: item,
                                                    previewReduceMotion: preferences.reduceMotion
                                                ) { toolId in
                                                    focusedToolStepId = toolId
                                                    workbenchOpen = true
                                                }
                                                .id(idx)
                                            }
                                            Color.clear.frame(height: 1).id("gate-a-scroll-bottom")
                                        }
                                        .padding(.horizontal, 12)
                                        .padding(.top, 4)
                                    }
                                    .accessibilityIdentifier("conversation-scroll")
                                    .onChange(of: fixtureFileName) { _, _ in
                                        if !store.session.conversation.isEmpty {
                                            proxy.scrollTo("gate-a-scroll-bottom", anchor: .bottom)
                                        }
                                    }
                                    .onChange(of: userTurnCount(in: store.session.conversation)) { oldCount, newCount in
                                        guard newCount > oldCount else { return }
                                        if case .user = store.session.conversation.last {
                                            proxy.scrollTo("gate-a-scroll-bottom", anchor: .bottom)
                                        }
                                    }
                                    .onAppear {
                                        if !store.session.conversation.isEmpty {
                                            proxy.scrollTo("gate-a-scroll-bottom", anchor: .bottom)
                                        }
                                        guard fixtureFileName.contains("long-thread-scroll") else { return }
                                        var step = 0
                                        GateAScrollPerformanceMonitor.startIfNeeded {
                                            step = (step + 8) % store.session.conversation.count
                                            withAnimation(.linear(duration: 0.08)) {
                                                proxy.scrollTo(step, anchor: .top)
                                            }
                                        }
                                    }
                                }
                            }
                        }
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                    }
                    .background(HarnessColors.canvas)
                    .safeAreaInset(edge: .bottom, spacing: 0) {
                        VStack(spacing: 0) {
                            ComposerStackView(
                                state: store.session.composer,
                                workbenchOpen: workbenchOpen,
                                composerBlock: preferences.resolveComposerBlock(),
                                onLoginClick: onOpenLogin,
                                onPreviewAction: store.applyPreviewAction
                            )
                        }
                        .background {
                            GeometryReader { proxy in
                                Color.clear.preference(
                                    key: ComposerChromeHeightKey.self,
                                    value: proxy.size.height
                                )
                            }
                        }
                        .background(HarnessColors.canvas)
                    }
                }
            }
            .overlay(alignment: .bottom) {
                let composer = store.session.composer
                if PreviewChromeFlags.showPlanOverlay,
                   !workbenchOpen,
                   composer.showPlan,
                   composer.mode != "clarification",
                   composer.mode != "hitl",
                   let plan = composer.plan
                {
                    PlanFloatingCardView(plan: plan, lockCollapsed: workbenchOpen)
                        .frame(maxWidth: 360)
                        .padding(.bottom, composerChromeHeight + 8)
                        .frame(maxWidth: .infinity)
                }
            }
            .onPreferenceChange(ComposerChromeHeightKey.self) { composerChromeHeight = $0 }

            WorkbenchSheetView(
                previewReduceMotion: preferences.reduceMotion,
                visible: workbenchOpen,
                state: store.session.workbench,
                onDismiss: {
                    workbenchOpen = false
                    focusedToolStepId = nil
                },
                onOpenReportReader: {
                    let md = store.session.workbench.reportMarkdown ?? "# Preview Report"
                    onOpenReportReader(store.session.title, md)
                },
                onOpenArtifactReader: {
                    let diff = store.session.workbench.artifactDiffPreview ?? "--- diff"
                    onOpenArtifactReader("Artifact", diff)
                },
                onOpenFilePreview: { fileName, markdown in
                    onOpenReportReader(fileName, markdown)
                },
                initialFocusedToolId: focusedToolStepId
            )

            SessionDrawerOverlayView(
                store: store,
                previewReduceMotion: preferences.reduceMotion,
                onOpenSettings: {
                    store.drawerOpen = false
                    onOpenSettings()
                })
        }
        .environment(\.previewContentFontSize, CGFloat(preferences.contentFontSize))
        .onAppear {
            guard !suppressAutoWorkbench else { return }
            let wb = store.session.workbench
            workbenchOpen = wb.workbenchCount > 0 || !wb.sources.isEmpty
        }
        .onChange(of: store.drawerOpen) { _, open in
            if open { PreviewKeyboardDismiss.run() }
        }
        .onChange(of: workbenchOpen) { _, open in
            if open { PreviewKeyboardDismiss.run() }
        }
    }
}

private func userTurnCount(in conversation: [ConversationItem]) -> Int {
    conversation.reduce(into: 0) { count, item in
        if case .user = item { count += 1 }
    }
}
