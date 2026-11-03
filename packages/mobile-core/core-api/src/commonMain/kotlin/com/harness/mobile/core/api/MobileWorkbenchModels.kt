package com.harness.mobile.core.api

data class MobileWorkbenchArtifactVersion(
    val id: String,
    val label: String,
    val selected: Boolean = false,
    val seriesId: String? = null,
    val logicalName: String? = null,
    val versionNumber: Int? = null,
    val expectedCurrentArtifactId: String? = null,
)

/** Engine → Port Workbench 投影（对齐 mobile-contract workbench JSON 子集）。 */
data class MobileWorkbenchSnapshot(
    val runId: String? = null,
    val initialView: String = "activity",
    val initialSheetIndex: Int = 2,
    val workbenchCount: Int = 0,
    val hasDeliverables: Boolean? = null,
    val activityEmphasis: String = "default",
    val activityTimeline: List<MobileWorkbenchActivityEvent> = emptyList(),
    val toolExecutions: List<MobileWorkbenchToolExecution> = emptyList(),
    val sources: List<MobileWorkbenchSource> = emptyList(),
    val sourcesRetrievalOnly: Boolean = false,
    val reportMarkdown: String? = null,
    val bashSnippet: String? = null,
    val artifactDiffPreview: String? = null,
    val artifactVersions: List<MobileWorkbenchArtifactVersion> = emptyList(),
    val artifactRestorePrompt: String? = null,
)

data class MobileWorkbenchActivityEvent(
    val id: String,
    val kind: String,
    val title: String,
    val status: String,
    val highlighted: Boolean = false,
)

data class MobileWorkbenchToolExecution(
    val id: String,
    val toolName: String,
    val title: String,
    val inputSummary: String,
    val outputSummary: String? = null,
    val detail: String? = null,
    val status: String,
    val elapsed: String? = null,
    val bashOutput: String? = null,
    val linkedSourceIndexes: List<Int> = emptyList(),
)

data class MobileWorkbenchSource(
    val title: String,
    val url: String,
    val snippet: String,
    val passageHeading: String? = null,
    val passageBody: String? = null,
)
