package com.harness.mobile.core.test

import com.harness.mobile.core.api.PersistedMessage
import com.harness.mobile.core.engine.SessionSnapshotProjector
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import kotlin.test.Test
import kotlin.test.assertEquals

class SessionSnapshotProjectorMergeTest {
    @Test
    fun mergeMessagePagesDedupesByIdAndSortsByCreatedAt() {
        val existing =
            listOf(
                msg("m2", "2026-01-02", "b"),
                msg("m3", "2026-01-03", "c"),
            )
        val older =
            listOf(
                msg("m1", "2026-01-01", "a"),
                msg("m2", "2026-01-02", "stale"),
            )
        val merged = SessionSnapshotProjector.mergeMessagePages(existing, older)
        assertEquals(listOf("m1", "m2", "m3"), merged.map { it.id })
        assertEquals("b", merged.first { it.id == "m2" }.content)
    }

    @Test
    fun projectsCompletedProcessBlocksPersistedInMessageMetadata() {
        val message =
            msg("assistant-1", "2026-01-01", "answer").copy(
                role = "assistant",
                metadata = buildJsonObject {
                    put("blocks", buildJsonArray {
                        add(buildJsonObject {
                            put("type", "reasoning")
                            put("id", "reasoning-1")
                            put("content", "先检索，再归纳")
                            put("durationMs", 1200)
                        })
                        add(buildJsonObject {
                            put("type", "tool_activity")
                            put("id", "tool-1")
                            put("toolName", "fetch_content")
                            put("status", "completed")
                        })
                    })
                },
            )

        val line = SessionSnapshotProjector.conversationFromMessages(listOf(message)).single()

        assertEquals(listOf("reasoning", "tool"), line.process.map { it.kind })
        assertEquals("先检索，再归纳", line.process.first().content)
        assertEquals(1200L, line.process.first().durationMs)
        assertEquals("fetch_content", line.process.last().name)
    }

    @Test
    fun projectsStableMessageIdsAndArtifactMetadata() {
        val message =
            msg("assistant-artifact", "2026-01-01", "已生成报告。").copy(
                role = "assistant",
                metadata = buildJsonObject {
                    put("blocks", buildJsonArray {
                        add(buildJsonObject {
                            put("type", "artifact")
                            put("artifactId", "art-1")
                            put("fileId", "file-1")
                            put("fileName", "report.md")
                            put("mediaType", "text/markdown")
                            put("fileKind", "markdown")
                            put("size", 42)
                            put("status", "ready")
                            put("createdAt", "2026-01-01T00:00:00Z")
                            put("seriesId", "series-1")
                            put("versionNumber", 2)
                            put("isCurrent", true)
                        })
                    })
                },
            )

        val line = SessionSnapshotProjector.conversationFromMessages(listOf(message)).single()

        assertEquals("assistant-artifact", line.id)
        assertEquals(1, line.artifacts.size)
        assertEquals("art-1", line.artifacts.single().artifactId)
        assertEquals("file-1", line.artifacts.single().fileId)
        assertEquals("markdown", line.artifacts.single().fileKind)
        assertEquals(true, line.artifacts.single().isCurrent)
    }

    @Test
    fun oldPayloadWithoutConversationLineIdStillDeserializes() {
        val payload =
            """{"session":{"id":"s1","title":"t","createdAt":"2026-01-01T00:00:00Z","updatedAt":"2026-01-01T00:00:00Z","messages":[]}}"""
        val parsed =
            kotlinx.serialization.json.Json { ignoreUnknownKeys = true }
                .decodeFromString<com.harness.mobile.core.api.SessionDetailResponse>(payload)
        assertEquals("s1", parsed.session.id)
    }

    private fun msg(
        id: String,
        createdAt: String,
        content: String,
    ): PersistedMessage =
        PersistedMessage(
            id = id,
            sessionId = "s1",
            role = "user",
            kind = "text",
            content = content,
            createdAt = createdAt,
        )
}
