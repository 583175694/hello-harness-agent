package com.harness.mobile.core.test

import com.harness.mobile.core.api.SessionSummary
import com.harness.mobile.core.engine.SessionSnapshotProjector
import kotlin.test.Test
import kotlin.test.assertEquals

class SessionSnapshotProjectorTest {
    @Test
    fun pinnedSessionsSortFirst() {
        val sorted =
            SessionSnapshotProjector.sortSummaries(
                listOf(
                    summary("b", pinned = false, updated = "2026-01-02T00:00:00Z"),
                    summary("a", pinned = true, updated = "2026-01-01T00:00:00Z"),
                ),
            )
        assertEquals("a", sorted.first().id)
    }

    private fun summary(
        id: String,
        pinned: Boolean,
        updated: String,
    ): SessionSummary =
        SessionSummary(
            id = id,
            title = id,
            isPinned = pinned,
            createdAt = updated,
            updatedAt = updated,
        )
}
