import Foundation

/// Phase A/B 共用语义；Preview 与 Core 各自实现（对齐 Android `AgentSessionPort.kt`）。
protocol AgentSessionPort: AnyObject {
    var sessionState: ActiveSessionState { get }

    func loadPreviewFixture(fileName: String) -> ActiveSessionState
    func listPreviewFixtures() -> [PreviewFixtureDescriptor]

    func refreshReadiness() async
    func refreshPublicConfig() async
    func refreshSessionList() async
    func resetForAuthChange() async
    func selectSession(sessionId: String) async
    func beginNewConversation() async
    func renameSession(sessionId: String, title: String) async
    func togglePinSession(sessionId: String) async
    func deleteSession(sessionId: String) async
    func submitComposerText(_ text: String, modelId: String?, reasoningEffort: String?, skillNames: [String]) async
    func addComposerSkill(_ skill: String)
    func uploadComposerAttachment(fileName: String, data: Data, mediaType: String) async throws
    func removeComposerAttachment(fileId: String)
    func respondClarification(_ answer: String) async
    func approveToolCalls() async
    func rejectToolCalls() async
    func cancelActiveRun() async
    func sendPendingInput(inputId: String) async
    func cancelPendingInput(inputId: String) async
    func refreshWorkbench() async
    func openWorkbenchPanel() async
    func focusWorkbenchToolCall(runId: String, toolCallId: String) async
    func setWorkbenchOpen(_ open: Bool)
    func clearWorkbenchFocusHint()
    func loadOlderMessages(sessionId: String) async
    func onAppBackground()
    func onAppForeground() async
    func restoreArtifactVersion(artifactId: String, expectedCurrentArtifactId: String) async
    func beginArtifactRevision(artifactId: String)
    func clearComposerRevisionSeed()
}

extension AgentSessionPort {
    func refreshReadiness() async {}
    func refreshPublicConfig() async {}
    func refreshSessionList() async {}
    func resetForAuthChange() async {}
    func selectSession(sessionId: String) async {}
    func beginNewConversation() async {}
    func renameSession(sessionId: String, title: String) async {}
    func togglePinSession(sessionId: String) async {}
    func deleteSession(sessionId: String) async {}
    func submitComposerText(_ text: String, modelId: String? = nil, reasoningEffort: String? = nil, skillNames: [String] = []) async {}
    func addComposerSkill(_ skill: String) {}
    func uploadComposerAttachment(fileName: String, data: Data, mediaType: String) async throws {}
    func removeComposerAttachment(fileId: String) {}
    func respondClarification(_ answer: String) async {}
    func approveToolCalls() async {}
    func rejectToolCalls() async {}
    func cancelActiveRun() async {}
    func sendPendingInput(inputId: String) async {}
    func cancelPendingInput(inputId: String) async {}
    func refreshWorkbench() async {}
    func openWorkbenchPanel() async {}
    func focusWorkbenchToolCall(runId: String, toolCallId: String) async {}
    func setWorkbenchOpen(_ open: Bool) {}
    func clearWorkbenchFocusHint() {}
    func loadOlderMessages(sessionId: String) async {}
    func onAppBackground() {}
    func onAppForeground() async {}
    func restoreArtifactVersion(artifactId: String, expectedCurrentArtifactId: String) async {}
    func beginArtifactRevision(artifactId: String) {}
    func clearComposerRevisionSeed() {}
}

enum AgentSessionPortModule {
    @MainActor
    static func make(
        loader: MobileContractPreviewLoader,
        preferences: PreviewAppPreferences = PreviewAppPreferences()
    ) -> AgentSessionPort {
        #if PREVIEW_PORT
        PreviewAgentSessionPort(loader: loader)
        #elseif CORE_PORT
        CoreAgentSessionPort(preferences: preferences)
        #else
        fatalError("Define PREVIEW_PORT or CORE_PORT")
        #endif
    }
}
