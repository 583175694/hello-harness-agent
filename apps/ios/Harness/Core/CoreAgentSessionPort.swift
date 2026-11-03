import Foundation

#if CORE_PORT
import HarnessMobileCore

private struct ComposerAttachmentLocal {
    var fileId: String
    var fileName: String
    var mediaType: String
    var previewUri: String?

    var item: ComposerAttachmentItem {
        ComposerAttachmentItem(
            id: fileId,
            fileName: fileName,
            mediaType: mediaType,
            previewUri: previewUri,
            status: "ready"
        )
    }
}

/// Production Core Port → KMP [HarnessEngineBridge]（`pnpm mobile-core:xcframework`）。
@MainActor
final class CoreAgentSessionPort: AgentSessionPort {
    private let bridge: HarnessEngineBridge
    private var composerSkills: [String] = []
    private var composerAttachments: [ComposerAttachmentLocal] = []
    private(set) var composerModelOptions: [ComposerModelOption] = []
    private(set) var skillPickerNames: [String] = []
    private(set) var sessionState = ActiveSessionState()
    var onSessionStateChange: ((ActiveSessionState) -> Void)?

    init(preferences: PreviewAppPreferences = PreviewAppPreferences()) {
        bridge = CoreServices.makeEngineBridge(preferences: preferences)
        bridge.startObserving { [weak self] viewState in
            Task { @MainActor in
                guard let self else { return }
                let merged = CoreSessionMapper.merge(
                    snapshot: viewState.snapshot,
                    connection: viewState.connection,
                    problem: viewState.problem
                )
                self.sessionState = self.mergeComposerState(merged)
                self.onSessionStateChange?(self.sessionState)
            }
        }
        bridge.bootstrapIfConfigured()
        refreshComposerCatalog()
    }

    private func mergeComposerState(_ base: ActiveSessionState) -> ActiveSessionState {
        var ui = base
        if !composerSkills.isEmpty {
            ui = ui.withComposerSkills(composerSkills)
        }
        ui = ui.withComposerAttachments(composerAttachments.map(\.item))
        return ui
    }

    func refreshComposerCatalog() {
        bridge.fetchComposerModelOptions { [weak self] options in
            Task { @MainActor in
                guard let self else { return }
                self.composerModelOptions = options.map {
                    ComposerModelOption(
                        id: $0.id,
                        label: $0.label,
                        reasoningOptions: $0.reasoningOptions.map { String(describing: $0) }
                    )
                }
                self.onSessionStateChange?(self.sessionState)
            }
        }
    }

    func refreshSkillPicker() {
        bridge.listSkills(query: nil) { [weak self] ok, _, names in
            Task { @MainActor in
                guard let self, ok.boolValue else { return }
                self.skillPickerNames = names.map { String(describing: $0) }
                self.onSessionStateChange?(self.sessionState)
            }
        }
    }

    deinit {
        bridge.close()
    }

    func loadPreviewFixture(fileName: String) -> ActiveSessionState {
        sessionState
    }

    func listPreviewFixtures() -> [PreviewFixtureDescriptor] { [] }

    func refreshReadiness() async {
        await withCheckedContinuation { (cont: CheckedContinuation<Void, Never>) in
            bridge.refreshReadiness { _, _ in cont.resume() }
        }
    }

    func refreshPublicConfig() async {
        await withCheckedContinuation { (cont: CheckedContinuation<Void, Never>) in
            bridge.refreshPublicConfig { _, _ in cont.resume() }
        }
    }

    func refreshSessionList() async {
        await withCheckedContinuation { (cont: CheckedContinuation<Void, Never>) in
            bridge.refreshSessionList { _, _ in cont.resume() }
        }
    }

    func selectSession(sessionId: String) async {
        clearComposerAttachments()
        bridge.selectSession(sessionId: sessionId)
    }

    func beginNewConversation() async {
        clearComposerAttachments()
        bridge.beginNewConversation()
    }

    private func clearComposerAttachments() {
        composerAttachments.removeAll()
        sessionState = mergeComposerState(sessionState)
        onSessionStateChange?(sessionState)
    }

    func renameSession(sessionId: String, title: String) async {
        bridge.renameSession(sessionId: sessionId, title: title)
    }

    func togglePinSession(sessionId: String) async {
        bridge.togglePinSession(sessionId: sessionId)
    }

    func deleteSession(sessionId: String) async {
        if sessionState.scenarioId == sessionId {
            clearComposerAttachments()
        }
        bridge.deleteSession(sessionId: sessionId)
    }

    func addComposerSkill(_ skill: String) {
        let normalized = skill.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !normalized.isEmpty, !composerSkills.contains(normalized), composerSkills.count < 6 else { return }
        composerSkills.append(normalized)
        sessionState = sessionState.withComposerSkills(composerSkills)
        onSessionStateChange?(sessionState)
    }

    func uploadComposerAttachment(fileName: String, data: Data, mediaType: String) async throws {
        guard composerAttachments.count < 4 else { return }
        let uploadSessionId = sessionState.scenarioId
        let base64 = data.base64EncodedString()
        try await withCheckedThrowingContinuation { (cont: CheckedContinuation<Void, Error>) in
            bridge.uploadComposerAttachmentBase64(
                fileName: fileName,
                base64Payload: base64,
                mediaType: mediaType
            ) { ok, message, fileId, uploadedName in
                if ok.boolValue, let fileId, let uploadedName {
                    Task { @MainActor in
                        guard self.selectionStillMatches(uploadSessionId) else {
                            cont.resume(throwing: NSError(
                                domain: "HarnessCore",
                                code: 2,
                                userInfo: [NSLocalizedDescriptionKey: "会话已切换，附件未加入当前草稿"]
                            ))
                            return
                        }
                        self.composerAttachments.append(ComposerAttachmentLocal(
                            fileId: fileId,
                            fileName: uploadedName,
                            mediaType: mediaType,
                            previewUri: nil
                        ))
                        self.sessionState = self.mergeComposerState(self.sessionState)
                        self.onSessionStateChange?(self.sessionState)
                        cont.resume()
                    }
                } else {
                    cont.resume(throwing: NSError(
                        domain: "HarnessCore",
                        code: 1,
                        userInfo: [NSLocalizedDescriptionKey: message ?? "上传失败"]
                    ))
                }
            }
        }
    }

    func removeComposerAttachment(fileId: String) {
        let trimmed = fileId.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }
        composerAttachments.removeAll { $0.fileId == trimmed }
        bridge.removeComposerAttachment(fileId: trimmed)
        sessionState = mergeComposerState(sessionState)
        onSessionStateChange?(sessionState)
    }

    func submitComposerText(_ text: String, modelId: String?, reasoningEffort: String?, skillNames: [String]) async {
        let skills = skillNames.isEmpty ? composerSkills : skillNames
        let attachmentIds = composerAttachments.map(\.fileId)
        let submittedSessionId = sessionState.scenarioId
        let ok = await withCheckedContinuation { (cont: CheckedContinuation<Bool, Never>) in
            bridge.submitComposer(
                text: text,
                modelId: modelId,
                reasoningEffort: reasoningEffort,
                skillNames: skills,
                attachmentIds: attachmentIds,
                onComplete: { success in
                    cont.resume(returning: success.boolValue)
                }
            )
        }
        guard ok else { return }
        // 上传/提交期间用户可能已切到别的会话：只清本次提交所属会话的草稿。
        guard selectionStillMatches(submittedSessionId) else { return }
        composerSkills.removeAll()
        composerAttachments.removeAll()
        sessionState = sessionState.withComposerSkills([]).withComposerAttachments([])
        onSessionStateChange?(sessionState)
    }

    /// 草稿属于“当前选中会话”。未选中时保存后选中也算同一草稿，切到已有会话则视为已切换。
    private func selectionStillMatches(_ selectionAtStart: String) -> Bool {
        selectionAtStart == "core-landing" || sessionState.scenarioId == selectionAtStart
    }

    func resetForAuthChange() async {
        composerSkills.removeAll()
        composerAttachments.removeAll()
        sessionState = sessionState.withComposerSkills([]).withComposerAttachments([])
        onSessionStateChange?(sessionState)
        await withCheckedContinuation { (cont: CheckedContinuation<Void, Never>) in
            bridge.resetForAuthChange { cont.resume() }
        }
    }

    func respondClarification(_ answer: String) async {
        await withCheckedContinuation { (cont: CheckedContinuation<Void, Never>) in
            bridge.respondClarification(answer: answer) { _, _ in cont.resume() }
        }
    }

    func approveToolCalls() async {
        await withCheckedContinuation { (cont: CheckedContinuation<Void, Never>) in
            bridge.approveToolCalls { _, _ in cont.resume() }
        }
    }

    func rejectToolCalls() async {
        await withCheckedContinuation { (cont: CheckedContinuation<Void, Never>) in
            bridge.rejectToolCalls { _, _ in cont.resume() }
        }
    }

    func cancelActiveRun() async {
        bridge.cancelActiveRun()
    }

    func sendPendingInput(inputId: String) async {
        let running = sessionState.sessionDrawer.sessions.contains { $0.active && $0.running }
        if running {
            bridge.promotePendingInput(inputId: inputId)
        } else {
            bridge.sendPendingInput(inputId: inputId)
        }
    }

    func cancelPendingInput(inputId: String) async {
        bridge.cancelPendingInput(inputId: inputId)
    }

    func refreshWorkbench() async {
        await withCheckedContinuation { (cont: CheckedContinuation<Void, Never>) in
            bridge.refreshWorkbench { _, _ in cont.resume() }
        }
    }

    func openWorkbenchPanel() async {
        await withCheckedContinuation { (cont: CheckedContinuation<Void, Never>) in
            bridge.openWorkbenchPanel { _, _ in cont.resume() }
        }
    }

    func focusWorkbenchToolCall(runId: String, toolCallId: String) async {
        await withCheckedContinuation { (cont: CheckedContinuation<Void, Never>) in
            bridge.focusWorkbenchToolCall(runId: runId, toolCallId: toolCallId) { _, _ in cont.resume() }
        }
    }

    func setWorkbenchOpen(_ open: Bool) {
        bridge.setWorkbenchOpen(open: open)
    }

    func clearWorkbenchFocusHint() {
        bridge.clearWorkbenchFocusHint()
    }

    func loadOlderMessages(sessionId: String) async {
        await withCheckedContinuation { (cont: CheckedContinuation<Void, Never>) in
            bridge.loadOlderMessages(sessionId: sessionId) { _, _ in cont.resume() }
        }
    }

    func onAppBackground() {
        bridge.onAppBackground()
    }

    func onAppForeground() async {
        await withCheckedContinuation { (cont: CheckedContinuation<Void, Never>) in
            bridge.onAppForeground { _, _ in cont.resume() }
        }
    }

    func restoreArtifactVersion(artifactId: String, expectedCurrentArtifactId: String) async {
        await withCheckedContinuation { (cont: CheckedContinuation<Void, Never>) in
            bridge.restoreArtifactVersion(
                artifactId: artifactId,
                expectedCurrentArtifactId: expectedCurrentArtifactId
            ) { _, _ in cont.resume() }
        }
    }

    func beginArtifactRevision(artifactId: String) {
        bridge.beginArtifactRevision(artifactId: artifactId)
    }

    func clearComposerRevisionSeed() {
        bridge.clearComposerRevisionSeed()
    }
}

#endif
