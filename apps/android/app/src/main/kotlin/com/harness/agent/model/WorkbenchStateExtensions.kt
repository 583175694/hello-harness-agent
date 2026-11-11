package com.harness.agent.model

import com.harness.mobile.core.api.ArtifactRef
import com.harness.mobile.core.api.MobileWorkbenchSnapshot
import com.harness.mobile.core.api.MobileWorkbenchSource
import com.harness.mobile.core.api.WorkbenchTabResolver

fun WorkbenchState.toMobileWorkbenchSnapshot(): MobileWorkbenchSnapshot =
    MobileWorkbenchSnapshot(
        runId = runId,
        initialView = initialView,
        initialSheetIndex = initialSheetIndex,
        workbenchCount = workbenchCount,
        hasDeliverables = hasDeliverables,
        activityEmphasis = activityEmphasis,
        sources =
            sources.map { card ->
                MobileWorkbenchSource(
                    title = card.title,
                    url = card.url,
                    snippet = card.snippet,
                    passageHeading = card.passageHeading,
                    passageBody = card.passageBody,
                )
            },
        sourcesRetrievalOnly = sourcesRetrievalOnly,
        reportMarkdown = reportMarkdown,
        deliverableFiles =
            deliverableFiles.map { file ->
                ArtifactRef(
                    artifactId = file.artifactId.orEmpty(),
                    fileId = file.fileId.orEmpty(),
                    fileName = file.fileName,
                    mediaType = file.mediaType.orEmpty(),
                    fileKind = file.fileKind.orEmpty(),
                )
            },
        artifactVersions =
            artifactVersions.map { ver ->
                com.harness.mobile.core.api.MobileWorkbenchArtifactVersion(
                    id = ver.id,
                    label = ver.label,
                    selected = ver.selected,
                    seriesId = ver.seriesId,
                    logicalName = ver.logicalName,
                    versionNumber = ver.versionNumber,
                    expectedCurrentArtifactId = ver.expectedCurrentArtifactId,
                )
            },
    )

fun WorkbenchState.visibleWorkbenchTabs(): List<String> =
    WorkbenchTabResolver.visibleTabs(toMobileWorkbenchSnapshot())

fun WorkbenchState.coerceWorkbenchTab(requested: String): String =
    WorkbenchTabResolver.coerceActiveTab(toMobileWorkbenchSnapshot(), requested)
