package com.harness.mobile.core.engine

import com.harness.mobile.core.api.ArtifactRef
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
            deliverableFiles = currentDeliverableFiles(series),
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

    fun currentDeliverableFiles(series: List<ArtifactSeriesRef>): List<ArtifactRef> =
        series.mapNotNull { s ->
            val current =
                s.currentArtifactId?.let { id -> s.versions.firstOrNull { it.artifactId == id } }
                    ?: s.versions.firstOrNull { it.isCurrent == true }
                    ?: s.versions.lastOrNull()
            current?.copy(
                seriesId = s.seriesId,
                logicalName = s.logicalName,
                isCurrent = true,
            )
        }.filter { it.artifactId.isNotBlank() }

    private fun versionsForSeries(series: ArtifactSeriesRef): List<MobileWorkbenchArtifactVersion> {
        val currentId = series.currentArtifactId
        return series.versions
            .sortedBy { it.versionNumber ?: 0 }
            .mapIndexedNotNull { index, ref ->
                val versionNumber = ref.versionNumber ?: return@mapIndexedNotNull null
                val selected = isSelectedVersion(series, ref.artifactId, index)
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

    /**
     * session 快照的 currentArtifactId 是唯一真源；仅当 series 没有 current 时才回退到
     * metadata 的 isCurrent，且取最后一个标记，避免旧 metadata 让多个版本同时显示“当前”。
     */
    internal fun isSelectedVersion(
        series: ArtifactSeriesRef,
        artifactId: String,
        sortedIndex: Int,
    ): Boolean {
        val currentId = series.currentArtifactId
        if (!currentId.isNullOrBlank()) return artifactId == currentId
        val flagged =
            series.versions
                .sortedBy { it.versionNumber ?: 0 }
                .mapIndexedNotNull { index, ref -> index.takeIf { ref.isCurrent == true } }
        return flagged.lastOrNull() == sortedIndex
    }

    private fun restorePromptForSeries(series: List<ArtifactSeriesRef>): String? {
        val primary = series.firstOrNull { it.versions.size > 1 } ?: series.firstOrNull() ?: return null
        return "恢复所选版本将覆盖工作区中的 ${primary.logicalName}。"
    }
}
