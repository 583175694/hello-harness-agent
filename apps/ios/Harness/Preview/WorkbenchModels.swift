import Foundation

struct WorkbenchActivityEvent: Equatable, Identifiable {
    let id: String
    let kind: String
    let title: String
    let status: String
    var highlighted: Bool = false
}

struct WorkbenchArtifactVersion: Equatable, Identifiable {
    let id: String
    let label: String
    var selected: Bool = false
}

struct WorkbenchToolExecution: Equatable, Identifiable {
    let id: String
    let toolName: String
    let title: String
    var inputSummary: String = ""
    var outputSummary: String?
    var detail: String?
    var status: String = "completed"
    var elapsed: String?
    var bashOutput: String?
    var linkedSourceIndexes: [Int] = []
}

struct WorkbenchDeliverableFile: Equatable, Identifiable {
    let id: String
    let fileName: String
    var subtitle: String = ""
    var previewMarkdown: String?
}

struct WorkbenchState: Equatable {
    var initialView: String = "activity"
    var initialSheetIndex: Int = 2
    var workbenchCount: Int = 0
    var hasDeliverables: Bool?
    var activityTimeline: [WorkbenchActivityEvent] = []
    var toolExecutions: [WorkbenchToolExecution] = []
    var deliverableFiles: [WorkbenchDeliverableFile] = []
    var bashSnippet: String?
    var reportMarkdown: String?
    var sources: [WorkbenchSourceCard] = []
    var sourcesRetrievalOnly: Bool = false
    var artifactVersions: [WorkbenchArtifactVersion] = []
    var artifactDiffPreview: String?
    var artifactRestorePrompt: String?
    var contextJsonPreview: String?

    var isActivityEmpty: Bool {
        toolExecutions.isEmpty &&
            activityTimeline.isEmpty &&
            (bashSnippet?.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ?? true)
    }

    var resolvedInitialDetent: Int {
        let emptyShell =
            workbenchCount == 0 &&
            toolExecutions.isEmpty &&
            activityTimeline.isEmpty &&
            (bashSnippet?.isEmpty ?? true) &&
            sources.isEmpty &&
            deliverableFiles.isEmpty &&
            artifactVersions.isEmpty
        return emptyShell ? 1 : min(max(initialSheetIndex, 0), 2)
    }
}

struct WorkbenchSourceCard: Equatable, Identifiable {
    var title: String
    var url: String
    var snippet: String
    var passageHeading: String?
    var passageBody: String?
    var id: String { url + title }
}
