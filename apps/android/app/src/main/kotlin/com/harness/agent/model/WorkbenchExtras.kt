package com.harness.agent.model

data class WorkbenchActivityEvent(
    val id: String,
    val kind: String,
    val title: String,
    val status: String,
    val highlighted: Boolean = false,
)

data class WorkbenchArtifactVersion(
    val id: String,
    val label: String,
    val selected: Boolean = false,
    val seriesId: String? = null,
    val logicalName: String? = null,
    val versionNumber: Int? = null,
    val expectedCurrentArtifactId: String? = null,
)

/** 对齐 Web/Web `ToolCallView`（Gate A Preview 子集）。 */
data class WorkbenchToolExecution(
    val id: String,
    val toolName: String,
    val title: String,
    val inputSummary: String = "",
    val outputSummary: String? = null,
    val detail: String? = null,
    val status: String = "completed",
    val elapsed: String? = null,
    val bashOutput: String? = null,
    val linkedSourceIndexes: List<Int> = emptyList(),
)

data class WorkbenchDeliverableFile(
    val id: String,
    val fileName: String,
    val subtitle: String = "",
    val previewMarkdown: String? = null,
)
