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
