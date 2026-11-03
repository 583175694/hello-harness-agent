package com.harness.agent.port

import com.harness.agent.model.WorkbenchActivityEvent
import com.harness.agent.model.WorkbenchArtifactVersion
import com.harness.agent.model.WorkbenchSourceCard
import com.harness.agent.model.WorkbenchState
import com.harness.agent.model.WorkbenchToolExecution
import com.harness.mobile.core.api.MobileWorkbenchSnapshot

object WorkbenchSnapshotMapper {
    fun toUi(snapshot: MobileWorkbenchSnapshot?): WorkbenchState {
        if (snapshot == null) return WorkbenchState()
        return WorkbenchState(
            runId = snapshot.runId,
            initialView = snapshot.initialView,
            initialSheetIndex = snapshot.initialSheetIndex.coerceIn(0, 2),
            workbenchCount = snapshot.workbenchCount,
            hasDeliverables = snapshot.hasDeliverables,
            activityEmphasis = snapshot.activityEmphasis,
            activityTimeline =
                snapshot.activityTimeline.map { event ->
                    WorkbenchActivityEvent(
                        id = event.id,
                        kind = event.kind,
                        title = event.title,
                        status = event.status,
                        highlighted = event.highlighted,
                    )
                },
            toolExecutions =
                snapshot.toolExecutions.map { tool ->
                    WorkbenchToolExecution(
                        id = tool.id,
                        toolName = tool.toolName,
                        title = tool.title,
                        inputSummary = tool.inputSummary,
                        outputSummary = tool.outputSummary,
                        detail = tool.detail,
                        status = tool.status,
                        elapsed = tool.elapsed,
                        bashOutput = tool.bashOutput,
                        linkedSourceIndexes = tool.linkedSourceIndexes,
                    )
                },
            deliverableFiles = emptyList(),
            bashSnippet = snapshot.bashSnippet,
            reportMarkdown = snapshot.reportMarkdown,
            sources =
                snapshot.sources.map { source ->
                    WorkbenchSourceCard(
                        title = source.title,
                        url = source.url,
                        snippet = source.snippet,
                        passageHeading = source.passageHeading,
                        passageBody = source.passageBody,
                    )
                },
            sourcesRetrievalOnly = snapshot.sourcesRetrievalOnly,
            artifactVersions =
                snapshot.artifactVersions.map { version ->
                    WorkbenchArtifactVersion(
                        id = version.id,
                        label = version.label,
                        selected = version.selected,
                        seriesId = version.seriesId,
                        logicalName = version.logicalName,
                        versionNumber = version.versionNumber,
                        expectedCurrentArtifactId = version.expectedCurrentArtifactId,
                    )
                },
            artifactDiffPreview = snapshot.artifactDiffPreview,
            artifactRestorePrompt = snapshot.artifactRestorePrompt,
        )
    }
}
