import SnapshotTesting
import SwiftUI
import XCTest

@testable import Harness

@MainActor
final class GateAMarkdownGoldenSnapshotTests: XCTestCase {
    /// 与 `packages/mobile-contract/fixtures/markdown-golden/manifest.json` 保持同步
    private static let fixtures: [String] = [
        "chat-markdown-gallery.json",
        "markdown-golden-wide-table.json",
        "markdown-golden-research-report.json",
        "markdown-golden-code-review.json",
        "markdown-golden-incident-summary.json",
    ]

    override func invokeTest() {
        withSnapshotTesting(record: SnapshotTestConfig.record) {
            super.invokeTest()
        }
    }

    func testAssistantMarkdownGoldens() {
        let loader = MobileContractPreviewLoader()
        for fileName in Self.fixtures {
            let session = loader.load(fileName: fileName)
            guard case .assistant(
                id: _,
                status: _,
                pending: _,
                pendingText: _,
                finalText: _,
                summary: _,
                tailTarget: _,
                markdownContent: let markdownContent,
                process: _,
                artifacts: _
            ) = session.conversation.last else {
                XCTFail("missing assistant in \(fileName)")
                continue
            }
            let markdown = (markdownContent ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
            XCTAssertFalse(markdown.isEmpty, "empty markdown in \(fileName)")
            let view =
                ChatMarkdownView(markdown: markdown)
                    .frame(width: 390, alignment: .leading)
                    .padding(.horizontal, 14)
                    .padding(.vertical, 8)
                    .background(HarnessColors.canvas)
            assertSnapshot(
                of: view,
                as: .image(layout: .sizeThatFits),
                named: fileName.replacingOccurrences(of: ".json", with: "")
            )
        }
    }
}
