import SnapshotTesting
import SwiftUI
import XCTest

@testable import Harness

@MainActor
final class GateAWorkbenchDetentSnapshotTests: XCTestCase {
    override func invokeTest() {
        withSnapshotTesting(record: SnapshotTestConfig.record) {
            super.invokeTest()
        }
    }

    func testWorkbenchLowDetentExposesComposer() {
        let loader = MobileContractPreviewLoader()
        var session = loader.load(fileName: "workbench-sources.json")
        session.workbench.initialSheetIndex = 0
        let store = PreviewSessionStore()
        store.session = session
        let preferences = PreviewAppPreferences()
        let view =
            PreviewChatShellView(
                store: store,
                fixtureFileName: "workbench-sources.json",
                preferences: preferences,
                onOpenSettings: {},
                onOpenReportReader: { _, _ in },
                suppressAutoWorkbench: true,
                initialWorkbenchOpen: true
            )
            .frame(width: 390, height: 844)
        assertSnapshot(
            of: view,
            as: .image(layout: .fixed(width: 390, height: 844)),
            named: "workbench-low-detent-44pct"
        )
    }
}
