package com.harness.mobile.core.test

import com.harness.mobile.core.api.SessionSummary
import com.harness.mobile.core.engine.SessionSnapshotProjector
import kotlin.test.Test
import kotlin.test.assertEquals

class SessionListProjectionTest {
    @Test
    fun olderPageAppendsWithoutDroppingLoadedRows() {
        val merged =
            SessionSnapshotProjector.mergeOlderSessionSummaries(
                existing = listOf(summary("s3"), summary("s2")),
                olderPage = listOf(summary("s2", title = "stale"), summary("s1")),
            )
        assertEquals(listOf("s3", "s2", "s1"), merged.map { it.id })
        assertEquals("s2", merged.first { it.id == "s2" }.title)
    }

    @Test
    fun firstPageRefreshKeepsLoadedOlderRowsAndPrefersFreshValues() {
        val merged =
            SessionSnapshotProjector.mergeSessionListFirstPage(
                firstPage = listOf(summary("s3"), summary("s2", title = "renamed")),
                existing = listOf(summary("s3", title = "old"), summary("s1")),
            )
        assertEquals(listOf("s3", "s2", "s1"), merged.map { it.id })
        assertEquals("renamed", merged.first { it.id == "s2" }.title)
    }

    @Test
    fun landingSnapshotCarriesSessionListPagination() {
        val snapshot =
            SessionSnapshotProjector.landingSnapshot(
                summaries = listOf(summary("s2"), summary("s1")),
                selectedId = null,
                runningSessionIds = emptySet(),
                canLoadOlderSessionSummaries = true,
                loadingOlderSessionSummaries = false,
            )
        assertEquals(true, snapshot.canLoadOlderSessionSummaries)
        assertEquals(false, snapshot.loadingOlderSessionSummaries)
    }

    @Test
    fun summariesSortPinnedFirstThenUpdatedAtAndId() {
        val sorted =
            SessionSnapshotProjector.sortSummaries(
                listOf(
                    summary("b", updated = "2026-01-01T00:00:00Z"),
                    summary("c", updated = "2026-01-01T00:00:00Z"),
                    summary("a", pinned = true, updated = "2025-01-01T00:00:00Z"),
                ),
            )
        assertEquals(listOf("a", "c", "b"), sorted.map { it.id })
    }

    private fun summary(
        id: String,
        title: String = id,
        pinned: Boolean = false,
        updated: String = "2026-01-01T00:00:00Z",
    ): SessionSummary =
        SessionSummary(
            id = id,
            title = title,
            isPinned = pinned,
            createdAt = updated,
            updatedAt = updated,
        )
}
