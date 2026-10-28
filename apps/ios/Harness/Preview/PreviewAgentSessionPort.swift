import Foundation

protocol AgentSessionPort {
    var sessionState: ActiveSessionState { get }
    func loadPreviewFixture(fileName: String) -> ActiveSessionState
    func listPreviewFixtures() -> [PreviewFixtureDescriptor]
}

final class PreviewAgentSessionPort: AgentSessionPort {
    private let loader: MobileContractPreviewLoader
    private(set) var sessionState: ActiveSessionState

    init(loader: MobileContractPreviewLoader) {
        self.loader = loader
        sessionState = ActiveSessionState()
    }

    func loadPreviewFixture(fileName: String) -> ActiveSessionState {
        let state = loader.load(fileName: fileName)
        sessionState = state
        return state
    }

    func listPreviewFixtures() -> [PreviewFixtureDescriptor] {
        loader.listPreviewFixtures()
    }
}
