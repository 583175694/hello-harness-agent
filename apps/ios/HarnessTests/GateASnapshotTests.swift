import SnapshotTesting
import SwiftUI
import XCTest

@testable import Harness

@MainActor
final class GateASnapshotTests: XCTestCase {
    override func invokeTest() {
        withSnapshotTesting(record: SnapshotTestConfig.record) {
            super.invokeTest()
        }
    }

    func testConnectionOfflineServiceBanner() {
        let view =
            ServiceBannerView(serviceState: "unavailable", onRetry: {}, onDismiss: {})
                .frame(width: 390)
        assertSnapshot(of: view, as: .image(layout: .sizeThatFits))
    }

    func testConnectionOfflineProblemDetails() {
        let view =
            ProblemDetailsCardView(
                title: "无法连接服务",
                detail: "Preview 假状态：offline / ProblemDetails（Phase A）。"
            )
            .frame(width: 390)
        assertSnapshot(of: view, as: .image(layout: .sizeThatFits))
    }

    func testProcessTimelineComposerPeekBar() {
        let view =
            ComposerPeekBarView(
                title: "正在搜索公开来源",
                subtitle: "步骤 2 / 5",
                onPress: {}
            )
            .frame(width: 390)
        assertSnapshot(of: view, as: .image(layout: .sizeThatFits))
    }

    func testComposerModelSheetOpen() {
        let view =
            ComposerModelSheetSnapshotView()
                .frame(width: 390, height: 360)
        assertSnapshot(of: view, as: .image(layout: .fixed(width: 390, height: 360)))
    }

    func testComposerAttachmentSheetOpen() {
        let view =
            ComposerAttachmentSheetSnapshotView()
                .frame(width: 390, height: 320)
        assertSnapshot(of: view, as: .image(layout: .fixed(width: 390, height: 320)))
    }

    func testComposerSkillSheetOpen() {
        let view =
            ComposerSkillSheetSnapshotView()
                .frame(width: 390, height: 360)
        assertSnapshot(of: view, as: .image(layout: .fixed(width: 390, height: 360)))
    }

    func testSettingsRootDefault() {
        let preferences = PreviewAppPreferences()
        let view =
            PreviewSettingsRootView(preferences: preferences)
                .frame(width: 390, height: 844)
                .background(HarnessColors.canvas)
        assertSnapshot(of: view, as: .image(layout: .fixed(width: 390, height: 844)))
    }

    func testMcpListWithSeedServer() {
        let preferences = PreviewAppPreferences()
        preferences.upsertMcp(
            PreviewMcpServer(
                id: "gate-a-seed",
                serverName: "local-research",
                url: "stdio://mcp-research",
                enabled: true
            )
        )
        let view =
            NavigationStack {
                PreviewMcpListView(preferences: preferences)
            }
            .frame(width: 390, height: 844)
            .background(HarnessColors.canvas)
        assertSnapshot(of: view, as: .image(layout: .fixed(width: 390, height: 844)))
    }

    func testMemoryHubDefault() {
        let preferences = PreviewAppPreferences()
        let view =
            NavigationStack {
                PreviewMemoryHubView(preferences: preferences)
            }
            .frame(width: 390, height: 844)
            .background(HarnessColors.canvas)
        assertSnapshot(of: view, as: .image(layout: .fixed(width: 390, height: 844)))
    }

    func testSessionDrawerOpen() {
        let loader = MobileContractPreviewLoader()
        let store = PreviewSessionStore()
        store.session = loader.load(fileName: "empty-landing.json")
        store.drawerSessions = store.session.sessionDrawer.sessions
        store.drawerOpen = true
        let preferences = PreviewAppPreferences()
        let view =
            SessionDrawerOverlayView(store: store, onOpenSettings: {})
                .frame(width: 390, height: 844)
                .background(HarnessColors.canvas)
        assertSnapshot(of: view, as: .image(layout: .fixed(width: 390, height: 844)))
    }
}
