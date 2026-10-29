import SnapshotTesting
import SwiftUI
import XCTest

@testable import Harness

@MainActor
final class GateAFixtureSnapshotTests: XCTestCase {
    private let loader = MobileContractPreviewLoader()

    override func invokeTest() {
        withSnapshotTesting(record: SnapshotTestConfig.record) {
            super.invokeTest()
        }
    }

    func testEmptyLanding() {
        let view =
            HStack(spacing: 14) {
                BrandIconView(size: 40)
                Text(HarnessCopy.newSessionWelcome)
                    .font(.system(size: 18, weight: .medium))
            }
            .frame(width: 390, height: 120)
            .background(HarnessColors.canvas)
        assertSnapshot(of: view, as: .image(layout: .sizeThatFits))
    }

    func testHitlClarificationComposer() {
        let session = loader.load(fileName: "hitl-clarification.json")
        let view =
            ComposerStackView(state: session.composer)
                .frame(width: 390)
                .background(HarnessColors.canvas)
        assertSnapshot(of: view, as: .image(layout: .sizeThatFits))
    }

    func testHitlToolApprovalComposer() {
        let session = loader.load(fileName: "hitl-tool-approval.json")
        let view =
            ComposerStackView(state: session.composer)
                .frame(width: 390)
                .background(HarnessColors.canvas)
        assertSnapshot(of: view, as: .image(layout: .sizeThatFits))
    }

    func testProcessTimelineToolsComposer() {
        let session = loader.load(fileName: "process-timeline-tools.json")
        let view =
            ComposerStackView(state: session.composer)
                .frame(width: 390)
                .background(HarnessColors.canvas)
        assertSnapshot(of: view, as: .image(layout: .sizeThatFits))
    }

    func testProcessTimelineToolsAssistantTurn() {
        let session = loader.load(fileName: "process-timeline-tools.json")
        guard case .assistant = session.conversation.last else {
            XCTFail("missing assistant")
            return
        }
        let turn = session.conversation.last!
        let view =
            ConversationTurnRowView(item: turn)
                .frame(width: 390)
                .padding(8)
                .background(HarnessColors.canvas)
        assertSnapshot(of: view, as: .image(layout: .sizeThatFits))
    }

    func testStreamingAssistantTailComposer() {
        let session = loader.load(fileName: "streaming-assistant-tail.json")
        let view =
            ComposerStackView(state: session.composer)
                .frame(width: 390)
                .background(HarnessColors.canvas)
        assertSnapshot(of: view, as: .image(layout: .sizeThatFits))
    }

    func testConnectionOfflineChrome() {
        let session = loader.load(fileName: "connection-offline-error.json")
        let view =
            VStack(spacing: 0) {
                ChatTopBarView(
                    title: session.title,
                    connectionState: session.chrome.connectionState,
                    runSummary: session.chrome.runSummary,
                    onOpenDrawer: {},
                    onOpenWorkbench: {}
                )
                ServiceBannerView(
                    serviceState: session.chrome.serviceState,
                    onRetry: {},
                    onDismiss: {}
                )
            }
            .frame(width: 390)
            .background(HarnessColors.canvas)
        assertSnapshot(of: view, as: .image(layout: .sizeThatFits))
    }

    func testConnectionReconnectingPill() {
        let view =
            ChatTopBarView(
                title: "连接恢复中",
                connectionState: "reconnecting",
                runSummary: "正在重连…",
                onOpenDrawer: {},
                onOpenWorkbench: {}
            )
            .frame(width: 390)
        assertSnapshot(of: view, as: .image(layout: .sizeThatFits))
    }

    func testWorkbenchReportMarkdownSheet() {
        let session = loader.load(fileName: "workbench-report-markdown.json")
        let view =
            WorkbenchSheetView(state: session.workbench, onDismiss: {})
                .frame(width: 390, height: 640)
                .background(HarnessColors.canvas)
        assertSnapshot(of: view, as: .image(layout: .fixed(width: 390, height: 640)))
    }

    func testWorkbenchReportMarkdownArtifactTab() {
        var session = loader.load(fileName: "workbench-report-markdown.json")
        session.workbench.initialView = "artifact"
        let view =
            WorkbenchSheetView(state: session.workbench, onDismiss: {})
                .frame(width: 390, height: 640)
                .background(HarnessColors.canvas)
        assertSnapshot(of: view, as: .image(layout: .fixed(width: 390, height: 640)))
    }

    func testRichSessionShowcaseWorkbenchSheet() {
        let session = loader.load(fileName: "rich-session-showcase.json")
        let view =
            WorkbenchSheetView(
                previewReduceMotion: true,
                visible: true,
                state: session.workbench,
                onDismiss: {}
            )
            .frame(width: 390, height: 640)
            .background(HarnessColors.canvas)
        assertSnapshot(of: view, as: .image(layout: .fixed(width: 390, height: 640)))
    }

    func testReportReaderFullScreen() {
        let session = loader.load(fileName: "workbench-report-markdown.json")
        let md = session.workbench.reportMarkdown ?? "# Preview Report"
        let view =
            NavigationStack {
                PreviewReportReaderView(title: session.title, markdown: md)
            }
            .frame(width: 390, height: 844)
        assertSnapshot(of: view, as: .image(layout: .fixed(width: 390, height: 844)))
    }

    func testArtifactReaderFullScreen() {
        let session = loader.load(fileName: "workbench-report-markdown.json")
        let diff = session.workbench.artifactDiffPreview ?? "--- diff"
        let view =
            NavigationStack {
                PreviewReportReaderView(title: "Artifact", markdown: diff, isArtifact: true)
            }
            .frame(width: 390, height: 844)
        assertSnapshot(of: view, as: .image(layout: .fixed(width: 390, height: 844)))
    }

    func testWorkbenchReportMarkdownArtifactRestoreConfirm() {
        let session = loader.load(fileName: "workbench-report-markdown.json")
        let message = session.workbench.artifactRestorePrompt ?? "Preview 静态确认。"
        let view =
            WorkbenchRestoreConfirmSnapshotView(message: message)
                .frame(width: 390, height: 220)
        assertSnapshot(of: view, as: .image(layout: .fixed(width: 390, height: 220)))
    }

    func testWorkbenchSourcesSheet() {
        let session = loader.load(fileName: "workbench-sources.json")
        let view =
            WorkbenchSheetView(state: session.workbench, onDismiss: {})
                .frame(width: 390, height: 640)
                .background(HarnessColors.canvas)
        assertSnapshot(of: view, as: .image(layout: .fixed(width: 390, height: 640)))
    }

    func testWorkbenchSourcesPassageHalfSheet() {
        let session = loader.load(fileName: "workbench-sources.json")
        guard let card = session.workbench.sources.first(where: { ($0.passageBody ?? "").isEmpty == false }) else {
            XCTFail("workbench-sources.json needs passageBody (#14)")
            return
        }
        let view =
            WorkbenchPassageSheetSnapshotView(card: card)
                .frame(width: 390, height: 420)
        assertSnapshot(of: view, as: .image(layout: .fixed(width: 390, height: 420)))
    }

    func testWorkbenchSourcesRetrievalOnlySheet() {
        let session = loader.load(fileName: "workbench-sources-retrieval-only.json")
        let view =
            WorkbenchSheetView(state: session.workbench, onDismiss: {})
                .frame(width: 390, height: 640)
                .background(HarnessColors.canvas)
        assertSnapshot(of: view, as: .image(layout: .fixed(width: 390, height: 640)))
    }

    func testWorkbenchActivityBashSheet() {
        let session = loader.load(fileName: "workbench-activity-bash.json")
        let view =
            WorkbenchSheetView(state: session.workbench, onDismiss: {})
                .frame(width: 390, height: 640)
                .background(HarnessColors.canvas)
        assertSnapshot(of: view, as: .image(layout: .fixed(width: 390, height: 640)))
    }

    func testStreamingAssistantTailTurn() {
        let session = loader.load(fileName: "streaming-assistant-tail.json")
        guard let turn = session.conversation.last else {
            XCTFail("missing assistant turn")
            return
        }
        let view =
            ConversationTurnRowView(item: turn)
                .frame(width: 390)
                .padding(8)
                .background(HarnessColors.canvas)
        assertSnapshot(of: view, as: .image(layout: .sizeThatFits))
    }

    func testLongThreadSampleTurns() {
        let session = loader.load(fileName: "long-thread-scroll.json")
        let turns = Array(session.conversation.prefix(2))
        let view =
            VStack(spacing: 8) {
                ForEach(Array(turns.enumerated()), id: \.offset) { _, turn in
                    ConversationTurnRowView(item: turn)
                }
            }
            .frame(width: 390)
            .padding(8)
            .background(HarnessColors.canvas)
        assertSnapshot(of: view, as: .image(layout: .sizeThatFits))
    }
}
