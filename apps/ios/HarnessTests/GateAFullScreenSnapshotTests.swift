import SnapshotTesting
import SwiftUI
import XCTest

@testable import Harness

@MainActor
final class GateAFullScreenSnapshotTests: XCTestCase {
    private static let fixtures: [String] = [
        "empty-landing.json",
        "streaming-assistant-tail.json",
        "long-thread-scroll.json",
        "process-timeline-tools.json",
        "hitl-clarification.json",
        "hitl-tool-approval.json",
        "workbench-activity-bash.json",
        "workbench-report-markdown.json",
        "workbench-sources.json",
        "workbench-sources-retrieval-only.json",
        "connection-offline-error.json",
        "rich-session-showcase.json",
        "stock-market-review.json",
    ]

    override func invokeTest() {
        withSnapshotTesting(record: SnapshotTestConfig.record) {
            super.invokeTest()
        }
    }

    func testFullShellFixtures() {
        let loader = MobileContractPreviewLoader()
        for fileName in Self.fixtures {
            let store = PreviewSessionStore()
            store.session = loader.load(fileName: fileName)
            store.drawerSessions = store.session.sessionDrawer.sessions
            store.drawerOpen = false
            let preferences = PreviewAppPreferences()
            let view =
                PreviewChatShellView(
                    store: store,
                    fixtureFileName: fileName,
                    preferences: preferences,
                    onOpenSettings: {},
                    onOpenReportReader: { _, _ in },
                    suppressAutoWorkbench: true
                )
                .frame(width: 390, height: 844)
            assertSnapshot(
                of: view,
                as: .image(layout: .fixed(width: 390, height: 844)),
                named: fileName.replacingOccurrences(of: ".json", with: "")
            )
        }
    }
}
