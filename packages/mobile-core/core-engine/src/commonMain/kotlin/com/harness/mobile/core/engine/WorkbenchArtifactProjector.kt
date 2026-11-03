package com.harness.mobile.core.engine

import com.harness.mobile.core.api.ArtifactSeriesRef
import com.harness.mobile.core.api.MobileWorkbenchArtifactVersion
import com.harness.mobile.core.api.MobileWorkbenchSnapshot

object WorkbenchArtifactProjector {
    fun applySeries(
        snapshot: MobileWorkbenchSnapshot,
        series: List<ArtifactSeriesRef>,
    ): MobileWorkbenchSnapshot {
        if (series.isEmpty()) return snapshot
        val versions = versionsFromSeries(series)
        if (versions.isEmpty()) return snapshot
        val countBoost = versions.size
        return snapshot.copy(
            artifactVersions = versions,
            artifactRestorePrompt = restorePromptForSeries(series),
            workbenchCount = snapshot.workbenchCount.coerceAtLeast(countBoost),
            hasDeliverables = snapshot.hasDeliverables ?: true,
        )
    }

    fun placeholderFromSeries(
        series: List<ArtifactSeriesRef>,
        runId: String?,
    ): MobileWorkbenchSnapshot {
        val count = series.sumOf { it.versions.size }
        val base =
            MobileWorkbenchSnapshot(
                runId = runId,
                initialView = "activity",
                initialSheetIndex = 2,
                workbenchCount = count.coerceAtLeast(1),
                hasDeliverables = count > 0,
            )
        return applySeries(base, series)
    }

    fun versionsFromSeries(series: List<ArtifactSeriesRef>): List<MobileWorkbenchArtifactVersion> =
        series.flatMap { s -> versionsForSeries(s) }

    private fun versionsForSeries(series: ArtifactSeriesRef): List<MobileWorkbenchArtifactVersion> {
        val currentId = series.currentArtifactId
        return series.versions
            .sortedBy { it.versionNumber ?: 0 }
            .mapNotNull { ref ->
                val versionNumber = ref.versionNumber ?: return@mapNotNull null
                val selected = ref.artifactId == currentId || ref.isCurrent == true
                val suffix = if (selected) "（当前）" else ""
                MobileWorkbenchArtifactVersion(
                    id = ref.artifactId,
                    label = "${series.logicalName} · v$versionNumber$suffix",
                    selected = selected,
                    seriesId = series.seriesId,
                    logicalName = series.logicalName,
                    versionNumber = versionNumber,
                    expectedCurrentArtifactId = currentId,
                )
            }
    }

    private fun restorePromptForSeries(series: List<ArtifactSeriesRef>): String? {
        val primary = series.firstOrNull { it.versions.size > 1 } ?: series.firstOrNull() ?: return null
        return "恢复所选版本将覆盖工作区中的 ${primary.logicalName}。"
    }
}
