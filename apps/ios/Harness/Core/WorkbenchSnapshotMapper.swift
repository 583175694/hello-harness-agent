import Foundation

#if CORE_PORT
import HarnessMobileCore

enum WorkbenchSnapshotMapper {
    static func toUi(_ snapshot: MobileWorkbenchSnapshot?) -> WorkbenchState {
        guard let snapshot else { return WorkbenchState() }
        let timeline: [WorkbenchActivityEvent] =
            snapshot.activityTimeline.map { event in
                WorkbenchActivityEvent(
                    id: event.id,
                    kind: event.kind,
                    title: event.title,
                    status: event.status,
                    highlighted: event.highlighted
                )
            }
        let tools: [WorkbenchToolExecution] =
            snapshot.toolExecutions.map { tool in
                WorkbenchToolExecution(
                    id: tool.id,
                    toolName: tool.toolName,
                    title: tool.title,
                    inputSummary: tool.inputSummary,
                    outputSummary: tool.outputSummary,
                    detail: tool.detail,
                    status: tool.status,
                    elapsed: tool.elapsed,
                    bashOutput: tool.bashOutput,
                    linkedSourceIndexes: tool.linkedSourceIndexes.map { Int($0.int32Value) }
                )
            }
        let sources: [WorkbenchSourceCard] =
            snapshot.sources.map { source in
                WorkbenchSourceCard(
                    title: source.title,
                    url: source.url,
                    snippet: source.snippet,
                    passageHeading: source.passageHeading,
                    passageBody: source.passageBody
                )
            }
        let sheetIndex = Int(snapshot.initialSheetIndex).clamped(to: 0...2)
        return WorkbenchState(
            runId: snapshot.runId,
            initialView: snapshot.initialView,
            initialSheetIndex: sheetIndex,
            workbenchCount: Int(snapshot.workbenchCount),
            hasDeliverables: snapshot.hasDeliverables?.boolValue,
            activityTimeline: timeline,
            toolExecutions: tools,
            deliverableFiles: snapshot.deliverableFiles.map { ref in
                WorkbenchDeliverableFile(
                    id: ref.artifactId,
                    fileName: ref.fileName,
                    subtitle: [ref.fileKind, ref.versionNumber.map { "v\($0.intValue)" }]
                        .compactMap { $0 }
                        .joined(separator: " · "),
                    artifactId: ref.artifactId,
                    fileId: ref.fileId,
                    mediaType: ref.mediaType,
                    fileKind: ref.fileKind,
                    size: Int(ref.size),
                    status: ref.status,
                    versionNumber: ref.versionNumber?.intValue,
                    isCurrent: ref.isCurrent?.boolValue ?? true
                )
            },
            bashSnippet: snapshot.bashSnippet,
            reportMarkdown: snapshot.reportMarkdown,
            sources: sources,
            sourcesRetrievalOnly: snapshot.sourcesRetrievalOnly,
            artifactVersions: snapshot.artifactVersions.map { version in
                WorkbenchArtifactVersion(
                    id: version.id,
                    label: version.label,
                    selected: version.selected,
                    seriesId: version.seriesId,
                    logicalName: version.logicalName,
                    versionNumber: version.versionNumber?.intValue,
                    expectedCurrentArtifactId: version.expectedCurrentArtifactId
                )
            },
            artifactDiffPreview: snapshot.artifactDiffPreview,
            artifactRestorePrompt: snapshot.artifactRestorePrompt
        )
    }
}

private extension Int {
    func clamped(to range: ClosedRange<Int>) -> Int {
        Swift.min(Swift.max(self, range.lowerBound), range.upperBound)
    }
}

#endif
