import Foundation
import Observation

@MainActor
@Observable
final class PreviewSessionStore {
    private let loader = MobileContractPreviewLoader()
    private let port: AgentSessionPort
    private let replayController = ReplayController()

    var session: ActiveSessionState
    let fixtures: [PreviewFixtureDescriptor]

    var drawerOpen = false
    var drawerSessions: [SessionDrawerItem] = []
    var drawerRefreshing = false
    var sessionMenuTarget: SessionDrawerItem?

    var composerModelCatalog: [ComposerModelOption] {
        #if CORE_PORT
        if let core = port as? CoreAgentSessionPort {
            return core.composerModelOptions.isEmpty
                ? ComposerCatalogDefaults.previewModels
                : core.composerModelOptions
        }
        #endif
        return ComposerCatalogDefaults.previewModels
    }

    var skillPickerNames: [String] {
        #if CORE_PORT
        if let core = port as? CoreAgentSessionPort, !core.skillPickerNames.isEmpty {
            return core.skillPickerNames
        }
        #endif
        return ComposerCatalogDefaults.previewSkills
    }

    var coreEngineActive: Bool {
        #if CORE_PORT
        return port is CoreAgentSessionPort
        #else
        return false
        #endif
    }

    init() {
        port = AgentSessionPortModule.make(loader: loader)
        fixtures = port.listPreviewFixtures()
        session = port.sessionState
        #if CORE_PORT
        if let corePort = port as? CoreAgentSessionPort {
            corePort.onSessionStateChange = { [weak self] updated in
                self?.session = updated
                self?.drawerSessions = updated.sessionDrawer.sessions
            }
            session = corePort.sessionState
            drawerSessions = session.sessionDrawer.sessions
            Task {
                await corePort.refreshReadiness()
                await corePort.refreshPublicConfig()
                await corePort.refreshSessionList()
                await corePort.beginNewConversation()
            }
        } else if let first = fixtures.first {
            load(fileName: first.fileName)
        }
        #else
        if let first = fixtures.first {
            load(fileName: first.fileName)
        }
        #endif
    }

    func load(fileName: String) {
        replayController.cancel()
        session = port.loadPreviewFixture(fileName: fileName)
        drawerSessions = session.sessionDrawer.sessions
        drawerOpen = session.uiHints.initialDrawerOpen
        replayController.startAssistantTailIfNeeded(
            config: session.replay,
            conversation: session.conversation
        ) { [weak self] updated in
            self?.session.conversation = updated
        }
    }

    func refreshDrawerSessions() {
        drawerRefreshing = true
        #if CORE_PORT
        if port is CoreAgentSessionPort {
            Task {
                await port.refreshSessionList()
                drawerSessions = session.sessionDrawer.sessions
                drawerRefreshing = false
            }
            return
        }
        #endif
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.6) { [weak self] in
            guard let self else { return }
            self.drawerSessions = self.session.sessionDrawer.sessions
            self.drawerRefreshing = false
        }
    }

    func selectSession(id: String) {
        #if CORE_PORT
        if port is CoreAgentSessionPort {
            Task {
                await port.selectSession(sessionId: id)
                drawerOpen = false
            }
            return
        }
        #endif
        drawerSessions = drawerSessions.map { item in
            var copy = item
            copy.active = item.id == id
            return copy
        }
        drawerOpen = false
    }

    func refreshWorkbench() {
        #if CORE_PORT
        guard port is CoreAgentSessionPort else { return }
        Task {
            await port.refreshWorkbench()
        }
        #endif
    }

    func openWorkbenchPanel() {
        #if CORE_PORT
        guard port is CoreAgentSessionPort else { return }
        Task {
            await port.openWorkbenchPanel()
        }
        #endif
    }

    func focusWorkbenchToolCall(runId: String, toolCallId: String) {
        #if CORE_PORT
        guard port is CoreAgentSessionPort else { return }
        Task {
            await port.focusWorkbenchToolCall(runId: runId, toolCallId: toolCallId)
        }
        #endif
    }

    func syncWorkbenchOpenFromUi(_ open: Bool) {
        #if CORE_PORT
        guard port is CoreAgentSessionPort else { return }
        port.setWorkbenchOpen(open)
        #endif
    }

    func clearWorkbenchFocusHint() {
        #if CORE_PORT
        guard port is CoreAgentSessionPort else { return }
        port.clearWorkbenchFocusHint()
        #endif
    }

    var isInDraftMode: Bool {
        guard let active = drawerSessions.first(where: { $0.active }) else { return false }
        return active.id.hasPrefix("draft-")
    }

    @discardableResult
    func startNewConversation(draftTitle: String) -> Bool {
        if isInDraftMode {
            drawerOpen = false
            return false
        }
        #if CORE_PORT
        if port is CoreAgentSessionPort {
            Task {
                await port.beginNewConversation()
            }
            drawerOpen = false
            return true
        }
        #endif
        let item = SessionDrawerItem(
            id: "draft-\(UUID().uuidString)",
            title: draftTitle,
            time: "刚刚",
            active: true,
            pinned: false,
            running: false
        )
        let inactive = drawerSessions.map { row in
            var copy = row
            copy.active = false
            return copy
        }
        let pinned = inactive.filter(\.pinned)
        let recent = inactive.filter { !$0.pinned }
        drawerSessions = pinned + [item] + recent
        drawerOpen = false
        return true
    }

    func renameSession(id: String, title: String) {
        #if CORE_PORT
        if port is CoreAgentSessionPort {
            Task {
                await port.renameSession(sessionId: id, title: title)
                sessionMenuTarget = nil
            }
            return
        }
        #endif
        drawerSessions = drawerSessions.map { $0.id == id ? SessionDrawerItem(
            id: $0.id, title: title, time: $0.time, active: $0.active, pinned: $0.pinned, running: $0.running
        ) : $0 }
        sessionMenuTarget = nil
    }

    func togglePinSession(id: String) {
        #if CORE_PORT
        if port is CoreAgentSessionPort {
            Task {
                await port.togglePinSession(sessionId: id)
                sessionMenuTarget = nil
            }
            return
        }
        #endif
        drawerSessions = drawerSessions.map { item in
            guard item.id == id else { return item }
            return SessionDrawerItem(
                id: item.id, title: item.title, time: item.time,
                active: item.active, pinned: !item.pinned, running: item.running
            )
        }
        sessionMenuTarget = nil
    }

    func deleteSession(id: String) {
        #if CORE_PORT
        if port is CoreAgentSessionPort {
            Task {
                await port.deleteSession(sessionId: id)
                sessionMenuTarget = nil
            }
            return
        }
        #endif
        drawerSessions.removeAll { $0.id == id }
        sessionMenuTarget = nil
    }

    func onComposerSkillSheetOpen() {
        #if CORE_PORT
        (port as? CoreAgentSessionPort)?.refreshSkillPicker()
        #endif
    }

    func resetForAuthChange() async {
        #if CORE_PORT
        guard let corePort = port as? CoreAgentSessionPort else { return }
        await corePort.resetForAuthChange()
        session = corePort.sessionState
        drawerSessions = session.sessionDrawer.sessions
        #endif
    }

    func uploadComposerAttachment(fileName: String, data: Data, mediaType: String) {
        #if CORE_PORT
        guard coreEngineActive else { return }
        Task {
            try? await port.uploadComposerAttachment(fileName: fileName, data: data, mediaType: mediaType)
        }
        #endif
    }

    func loadOlderMessages() {
        #if CORE_PORT
        guard port is CoreAgentSessionPort else { return }
        let sessionId = session.scenarioId
        guard !sessionId.isEmpty, sessionId != "core-landing" else { return }
        Task {
            await port.loadOlderMessages(sessionId: sessionId)
        }
        #endif
    }

    func onAppBackground() {
        #if CORE_PORT
        guard port is CoreAgentSessionPort else { return }
        port.onAppBackground()
        #endif
    }

    func onAppForeground() {
        #if CORE_PORT
        guard port is CoreAgentSessionPort else { return }
        Task {
            await port.onAppForeground()
        }
        #endif
    }

    func restoreArtifactVersion(restoreId: String, expectedCurrentArtifactId: String) {
        #if CORE_PORT
        guard port is CoreAgentSessionPort else { return }
        Task {
            await port.restoreArtifactVersion(
                artifactId: restoreId,
                expectedCurrentArtifactId: expectedCurrentArtifactId
            )
        }
        #endif
    }

    func beginArtifactRevision(artifactId: String) {
        #if CORE_PORT
        guard port is CoreAgentSessionPort else { return }
        port.beginArtifactRevision(artifactId: artifactId)
        #endif
    }

    func clearComposerRevisionSeed() {
        #if CORE_PORT
        guard port is CoreAgentSessionPort else { return }
        port.clearComposerRevisionSeed()
        #endif
    }

    func applyPreviewAction(_ action: PreviewUiAction) {
        #if CORE_PORT
        if port is CoreAgentSessionPort {
            Task {
                switch action {
                case .addSkill(let skill):
                    port.addComposerSkill(skill)
                case .sendComposerText(let text, let modelId, let reasoning, let skillNames):
                    await port.submitComposerText(text, modelId: modelId, reasoningEffort: reasoning, skillNames: skillNames)
                case .submitClarification(let answer):
                    await port.respondClarification(answer)
                case .approveTools:
                    await port.approveToolCalls()
                case .rejectTools:
                    await port.rejectToolCalls()
                case .cancelRun, .stopRun:
                    await port.cancelActiveRun()
                case .sendFollowUp(let id):
                    await port.sendPendingInput(inputId: id)
                case .dismissFollowUp(let id):
                    await port.cancelPendingInput(inputId: id)
                case .removeAttachment(let fileId):
                    port.removeComposerAttachment(fileId: fileId)
                default:
                    break
                }
            }
            return
        }
        #endif
        session = PreviewSessionReducer.reduce(state: session, action: action)
    }

    private var apiUrlRefreshTask: Task<Void, Never>?

    func scheduleCoreConnectionRefresh() {
        #if CORE_PORT
        guard port is CoreAgentSessionPort else { return }
        apiUrlRefreshTask?.cancel()
        apiUrlRefreshTask = Task {
            try? await Task.sleep(nanoseconds: 500_000_000)
            guard !Task.isCancelled else { return }
            await port.refreshReadiness()
            await port.refreshPublicConfig()
        }
        #endif
    }
}
