import Foundation
import Observation

@MainActor
@Observable
final class PreviewSessionStore {
    private let loader = MobileContractPreviewLoader()
    private let port: PreviewAgentSessionPort
    private let replayController = ReplayController()

    var session: ActiveSessionState
    let fixtures: [PreviewFixtureDescriptor]

    var drawerOpen = false
    var drawerSessions: [SessionDrawerItem] = []
    var drawerRefreshing = false
    var sessionMenuTarget: SessionDrawerItem?

    init() {
        port = PreviewAgentSessionPort(loader: loader)
        fixtures = port.listPreviewFixtures()
        session = port.sessionState
        if let first = fixtures.first {
            load(fileName: first.fileName)
        }
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
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.6) { [weak self] in
            guard let self else { return }
            self.drawerSessions = self.session.sessionDrawer.sessions
            self.drawerRefreshing = false
        }
    }

    func selectSession(id: String) {
        drawerSessions = drawerSessions.map { item in
            var copy = item
            copy.active = item.id == id
            return copy
        }
        drawerOpen = false
    }

    func renameSession(id: String, title: String) {
        drawerSessions = drawerSessions.map { $0.id == id ? SessionDrawerItem(
            id: $0.id, title: title, time: $0.time, active: $0.active, pinned: $0.pinned, running: $0.running
        ) : $0 }
        sessionMenuTarget = nil
    }

    func togglePinSession(id: String) {
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
        drawerSessions.removeAll { $0.id == id }
        sessionMenuTarget = nil
    }

    func applyPreviewAction(_ action: PreviewUiAction) {
        session = PreviewSessionReducer.reduce(state: session, action: action)
    }
}
