package com.harness.agent.model

data class WorkbenchState(
    val initialView: String = "activity",
    val initialSheetIndex: Int = 2,
    val workbenchCount: Int = 0,
    val hasDeliverables: Boolean? = null,
    val activityEmphasis: String = "default",
    val activityTimeline: List<WorkbenchActivityEvent> = emptyList(),
    val toolExecutions: List<WorkbenchToolExecution> = emptyList(),
    val deliverableFiles: List<WorkbenchDeliverableFile> = emptyList(),
    val bashSnippet: String? = null,
    val reportMarkdown: String? = null,
    val sources: List<WorkbenchSourceCard> = emptyList(),
    val sourcesRetrievalOnly: Boolean = false,
    val artifactVersions: List<WorkbenchArtifactVersion> = emptyList(),
    val artifactDiffPreview: String? = null,
    val artifactRestorePrompt: String? = null,
    val contextJsonPreview: String? = null,
)

data class WorkbenchSourceCard(
    val title: String,
    val url: String,
    val snippet: String,
    val passageHeading: String? = null,
    val passageBody: String? = null,
)
