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
    var onOpenArtifactReader: (ReaderTarget) -> Void = { _ in }
    var onLoadDemoFixture: () -> Void = {}
    /// 快照测试：禁止 onAppear 自动展开 Workbench。
    var suppressAutoWorkbench: Bool = false
    /// 快照测试：固定 Workbench 初始展开（与 suppressAutoWorkbench 联用）。
    var initialWorkbenchOpen: Bool = false
    @State private var workbenchOpen: Bool
    @State private var focusedToolStepId: String?
    @State private var serviceBannerDismissed = false
    @State private var composerChromeHeight: CGFloat = 0
    @Environment(\.appToast) private var appToast

    init(
        store: PreviewSessionStore,
        fixtureFileName: String,
        preferences: PreviewAppPreferences,
        onOpenSettings: @escaping () -> Void,
        onOpenLogin: @escaping () -> Void = {},
        onOpenReportReader: @escaping (String, String) -> Void,
        onOpenArtifactReader: @escaping (ReaderTarget) -> Void = { _ in },
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
                    onOpenDrawer: openDrawer,
                    onNewConversation: startNewConversation,
                    onOpenWorkbench: openWorkbench
                )
                ZStack {
                    VStack(spacing: 0) {
                        conversationArea
                    }
                }
            }
            .overlay(alignment: .bottom) {
                planOverlay
            }
            .onPreferenceChange(ComposerChromeHeightKey.self) { composerChromeHeight = $0 }

            workbenchSheet
            sessionDrawer
        }
        .environment(\.previewContentFontSize, CGFloat(preferences.contentFontSize))
        .onChange(of: store.session.scenarioId) { _, _ in
            workbenchOpen = false
            focusedToolStepId = nil
            store.syncWorkbenchOpenFromUi(false)
        }
        .onChange(of: store.drawerOpen) { _, open in
            if open { PreviewKeyboardDismiss.run() }
        }
        .onChange(of: workbenchOpen) { _, open in
            if open { PreviewKeyboardDismiss.run() }
        }
        .onChange(of: store.session.uiHints.workbenchFocusedToolCallId) { _, toolId in
            guard store.coreEngineActive, let toolId, !toolId.isEmpty else { return }
            focusedToolStepId = toolId
        }
        .onChange(of: store.session.uiHints.workbenchFocusHint) { _, hint in
            guard store.coreEngineActive, let hint, !hint.isEmpty else { return }
            appToast.show(hint)
            store.clearWorkbenchFocusHint()
        }
    }
}

private extension PreviewChatShellView {
    func openDrawer() {
        PreviewKeyboardDismiss.run()
        store.drawerOpen = true
    }

    func startNewConversation() {
        PreviewKeyboardDismiss.run()
        let started = store.startNewConversation(draftTitle: store.session.sessionDrawer.draftTitle)
        if !started {
            appToast.show(HarnessCopy.alreadyInNewSession)
        }
    }

    func openWorkbench() {
        PreviewKeyboardDismiss.run()
        if store.coreEngineActive {
            store.openWorkbenchPanel()
        } else {
            store.refreshWorkbench()
        }
        workbenchOpen = true
        store.syncWorkbenchOpenFromUi(true)
    }

    var conversationArea: some View {
        VStack(spacing: 0) {
            serviceChrome
            Group {
                if store.session.conversation.isEmpty {
                    emptyConversationView
                } else {
                    ScrollViewReader { proxy in
                        conversationScrollView(proxy: proxy)
                    }
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .overlay(alignment: .top) {
                topFade
            }
            .overlay(alignment: .bottom) {
                bottomFade
            }
            composerInset
        }
        .background(HarnessColors.canvas)
    }

    @ViewBuilder
    var serviceChrome: some View {
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
    }

    var emptyConversationView: some View {
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
    }

    var topFade: some View {
        LinearGradient(
            colors: [HarnessColors.canvas, HarnessColors.canvas.opacity(0)],
            startPoint: .top,
            endPoint: .bottom
        )
        .frame(height: 18)
        .allowsHitTesting(false)
    }

    var bottomFade: some View {
        LinearGradient(
            colors: [HarnessColors.canvas.opacity(0), HarnessColors.canvas],
            startPoint: .top,
            endPoint: .bottom
        )
        .frame(height: 18)
        .allowsHitTesting(false)
    }

    var composerInset: some View {
        VStack(spacing: 0) {
            ComposerStackView(
                state: store.session.composer,
                workbenchOpen: workbenchOpen,
                composerBlock: preferences.resolveComposerBlock(),
                onLoginClick: onOpenLogin,
                onPreviewAction: store.applyPreviewAction,
                useCoreAttachments: store.coreEngineActive,
                onUploadAttachmentData: { name, data, mime in
                    store.uploadComposerAttachment(fileName: name, data: data, mediaType: mime)
                },
                modelCatalog: store.composerModelCatalog,
                skillPickerNames: store.skillPickerNames,
                onSkillSheetOpen: store.onComposerSkillSheetOpen,
                onClearComposerRevisionSeed: store.clearComposerRevisionSeed,
                onSendComposerText: { text, modelId, reasoningEffort, skillNames, completion in
                    store.submitComposerText(
                        text: text,
                        modelId: modelId,
                        reasoningEffort: reasoningEffort,
                        skillNames: skillNames,
                        onAccepted: completion
                    )
                }
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
        .onChange(of: store.composerSubmitError) { _, message in
            guard let message, !message.isEmpty else { return }
            appToast.show(message)
            store.composerSubmitError = nil
        }
        .background(HarnessColors.canvas)
    }

    @ViewBuilder
    var planOverlay: some View {
        let composer = store.session.composer
        let planEnabled = composer.showPlan && (store.coreEngineActive || PreviewChromeFlags.showPlanOverlay)
        if planEnabled,
           !workbenchOpen,
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

    var workbenchSheet: some View {
        WorkbenchSheetView(
            previewReduceMotion: preferences.reduceMotion,
            visible: workbenchOpen,
            state: store.session.workbench,
            onDismiss: {
                workbenchOpen = false
                focusedToolStepId = nil
                store.syncWorkbenchOpenFromUi(false)
            },
            onOpenReportReader: {
                let md = store.session.workbench.reportMarkdown ?? ""
                onOpenReportReader(store.session.title, md)
            },
            onOpenArtifactReader: openWorkbenchArtifact,
            onRestoreArtifactVersion: restoreArtifactVersion,
            onBeginArtifactRevision: beginArtifactRevision,
            onDownloadDeliverable: downloadWorkbenchDeliverable,
            initialFocusedToolId: focusedToolStepId
        )
    }

    var sessionDrawer: some View {
        SessionDrawerOverlayView(
            store: store,
            previewReduceMotion: preferences.reduceMotion,
            onOpenSettings: {
                store.drawerOpen = false
                onOpenSettings()
            }
        )
    }

    func openWorkbenchArtifact(_ file: WorkbenchDeliverableFile) {
        onOpenArtifactReader(ReaderTarget(
            artifactId: file.artifactId,
            fileId: file.fileId,
            fileName: file.fileName,
            mediaType: file.mediaType,
            fileKind: file.fileKind
        ))
    }

    func restoreArtifactVersion(_ restoreId: String, _ expectedId: String) {
        if store.coreEngineActive {
            store.restoreArtifactVersion(
                restoreId: restoreId,
                expectedCurrentArtifactId: expectedId
            )
        } else {
            appToast.show("Preview：已确认恢复（未写服务器）")
        }
    }

    func beginArtifactRevision(_ artifactId: String) {
        if store.coreEngineActive {
            store.beginArtifactRevision(artifactId: artifactId)
        } else {
            appToast.show("Preview：已预填修改草稿（未写服务器）")
        }
    }

    func downloadWorkbenchDeliverable(_ file: WorkbenchDeliverableFile) {
        guard store.coreEngineActive else { return }
        let target = ReaderTarget(
            artifactId: file.artifactId,
            fileId: file.fileId,
            fileName: file.fileName,
            mediaType: file.mediaType,
            fileKind: file.fileKind
        )
        Task {
            let result = await store.download(target: target)
            switch result {
            case .success(let content):
                ReaderFileSharing.present(data: content.bytes, fileName: content.fileName, contentType: content.contentType)
            case .failure:
                appToast.show("下载失败")
            }
        }
    }
}

private extension PreviewChatShellView {
    @ViewBuilder
    func conversationScrollView(proxy: ScrollViewProxy) -> some View {
        ScrollView {
            conversationList
        }
        .accessibilityIdentifier("conversation-scroll")
        .onChange(of: fixtureFileName) { _, _ in
            scrollToBottom(proxy)
        }
        .onChange(of: userTurnCount(in: store.session.conversation)) { oldCount, newCount in
            guard newCount > oldCount else { return }
            if case .user = store.session.conversation.last {
                scrollToBottom(proxy)
            }
        }
        .onAppear {
            if !store.session.conversation.isEmpty {
                scrollToBottom(proxy)
            }
            startGateAScrollIfNeeded(proxy: proxy)
        }
    }

    @ViewBuilder
    var conversationList: some View {
        LazyVStack(spacing: HarnessLayout.chatListTurnSpacing) {
            if store.session.canLoadOlderMessages {
                Button {
                    store.loadOlderMessages()
                } label: {
                    Text(
                        store.session.loadingOlderMessages
                            ? "正在加载更早消息…"
                            : "加载更早消息"
                    )
                    .font(.footnote)
                    .foregroundStyle(HarnessColors.secondary)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 12)
                }
                .disabled(store.session.loadingOlderMessages)
            }
            ForEach(Array(store.session.conversation.enumerated()), id: \.offset) { _, item in
                conversationRow(item)
            }
            Color.clear
                .frame(height: 28)
                .id("conversation-tail-spacer")
        }
        .padding(.horizontal, 12)
        .padding(.top, 4)
        .padding(.bottom, 4)
    }

    func startGateAScrollIfNeeded(proxy: ScrollViewProxy) {
        guard fixtureFileName.contains("long-thread-scroll") else { return }
        var step = 0
        GateAScrollPerformanceMonitor.startIfNeeded {
            step = (step + 8) % store.session.conversation.count
            guard step < store.session.conversation.count else { return }
            withAnimation(.linear(duration: 0.08)) {
                proxy.scrollTo(store.session.conversation[step].id, anchor: .top)
            }
        }
    }
}

private extension PreviewChatShellView {
    @ViewBuilder
    func conversationRow(_ item: ConversationItem) -> some View {
        ConversationTurnRowView(
            item: item,
            previewReduceMotion: preferences.reduceMotion,
            onOpenWorkbenchStep: openWorkbenchStep,
            onOpenArtifact: openArtifact
        )
    }

    func openWorkbenchStep(_ toolId: String) {
        focusedToolStepId = toolId
        workbenchOpen = true
        guard store.coreEngineActive else { return }
        let runId = store.session.workbench.runId ?? store.session.scenarioId
        store.focusWorkbenchToolCall(runId: runId, toolCallId: toolId)
        store.syncWorkbenchOpenFromUi(true)
    }

    func openArtifact(_ artifact: ArtifactItem) {
        onOpenArtifactReader(ReaderTarget(
            artifactId: artifact.artifactId,
            fileId: artifact.fileId,
            fileName: artifact.fileName,
            mediaType: artifact.mediaType,
            fileKind: artifact.fileKind
        ))
    }

    func scrollToBottom(_ proxy: ScrollViewProxy) {
        guard !store.session.conversation.isEmpty else { return }
        proxy.scrollTo("conversation-tail-spacer", anchor: .bottom)
    }
}

private func userTurnCount(in conversation: [ConversationItem]) -> Int {
    conversation.reduce(into: 0) { count, item in
        if case .user = item { count += 1 }
    }
}
