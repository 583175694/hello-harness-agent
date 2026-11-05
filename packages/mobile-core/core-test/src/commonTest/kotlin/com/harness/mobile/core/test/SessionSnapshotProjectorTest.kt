package com.harness.mobile.core.test

import com.harness.mobile.core.api.SessionSummary
import com.harness.mobile.core.api.ArtifactRef
import com.harness.mobile.core.api.ArtifactSeriesRef
import com.harness.mobile.core.api.PersistedMessage
import com.harness.mobile.core.api.SessionDetail
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

    @Test
    fun artifactCardsFollowSeriesCurrentVersion() {
        val message =
            PersistedMessage(
                id = "m1",
                sessionId = "s1",
                role = "assistant",
                kind = "assistant_message",
                content = "",
                createdAt = "2026-01-01T00:00:00Z",
                metadata =
                    kotlinx.serialization.json.Json.parseToJsonElement(
                        """{"blocks":[{"type":"artifact","artifactId":"v1","fileId":"f1","fileName":"a.md","mediaType":"text/markdown","fileKind":"markdown","isCurrent":true}]}""",
                    ) as kotlinx.serialization.json.JsonObject,
            )
        val detail =
            SessionDetail(
                id = "s1",
                title = "s1",
                createdAt = "2026-01-01T00:00:00Z",
                updatedAt = "2026-01-01T00:00:00Z",
                messages = listOf(message),
                artifactSeries =
                    listOf(
                        ArtifactSeriesRef(
                            seriesId = "series",
                            sessionId = "s1",
                            logicalName = "a.md",
                            currentArtifactId = "v2",
                            versions = listOf(ArtifactRef(artifactId = "v1", fileId = "f1", fileName = "a.md"), ArtifactRef(artifactId = "v2", fileId = "f2", fileName = "a.md")),
                        ),
                    ),
            )
        val snapshot = SessionSnapshotProjector.fromDetail(detail, emptyList(), emptySet())
        assertEquals(false, snapshot.conversation.single().artifacts.single().isCurrent)
    }

    @Test
    fun finalHistoryPageDisablesLoadOlderEvenWithoutCursor() {
        val detail =
            SessionDetail(
                id = "s1",
                title = "s1",
                createdAt = "2026-01-01T00:00:00Z",
                updatedAt = "2026-01-01T00:00:00Z",
                messages = emptyList(),
                pagination =
                    com.harness.mobile.core.api.SessionPagination(
                        limit = 100,
                        hasMore = false,
                        nextBefore = null,
                    ),
            )
        val snapshot = SessionSnapshotProjector.fromDetail(detail, emptyList(), emptySet())
        assertEquals(false, snapshot.canLoadOlderMessages)
    }

    @Test
    fun earlierHistoryPageKeepsLoadOlderAvailable() {
        val detail =
            SessionDetail(
                id = "s1",
                title = "s1",
                createdAt = "2026-01-01T00:00:00Z",
                updatedAt = "2026-01-01T00:00:00Z",
                messages = emptyList(),
                pagination =
                    com.harness.mobile.core.api.SessionPagination(
                        limit = 100,
                        hasMore = true,
                        nextBefore = "cursor-2",
                    ),
            )
        val snapshot = SessionSnapshotProjector.fromDetail(detail, emptyList(), emptySet())
        assertEquals(true, snapshot.canLoadOlderMessages)
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
