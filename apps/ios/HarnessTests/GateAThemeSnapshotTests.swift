import SnapshotTesting
import SwiftUI
import XCTest

@testable import Harness

@MainActor
final class GateAThemeSnapshotTests: XCTestCase {
    override func invokeTest() {
        withSnapshotTesting(record: SnapshotTestConfig.record) {
            super.invokeTest()
        }
    }

    /// 对齐 Android `GateAThemeSnapshotTest.darkTheme_emptyLanding_fullShell`（§4.3 深色 + 字号）。
    func testDarkThemeEmptyLandingFullShell() {
        let loader = MobileContractPreviewLoader()
        let store = PreviewSessionStore()
        store.session = loader.load(fileName: "empty-landing.json")
        store.drawerOpen = false
        let preferences = PreviewAppPreferences()
        preferences.themeMode = .dark
        preferences.contentFontSize = 17

        let view =
            PreviewChatShellView(
                store: store,
                fixtureFileName: "empty-landing.json",
                preferences: preferences,
                onOpenSettings: {},
                onOpenReportReader: { _, _ in },
                suppressAutoWorkbench: true
            )
            .preferredColorScheme(.dark)
            .frame(width: 390, height: 844)

        assertSnapshot(of: view, as: .image(layout: .fixed(width: 390, height: 844)))
    }
}
