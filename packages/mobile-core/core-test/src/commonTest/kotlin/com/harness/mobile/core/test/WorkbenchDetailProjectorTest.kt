package com.harness.mobile.core.test

import com.harness.mobile.core.api.RunDetailResponse
import com.harness.mobile.core.engine.WorkbenchDetailProjector
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class WorkbenchDetailProjectorTest {
    private val json = Json { ignoreUnknownKeys = true }

    @Test
    fun fromRunDetail_mapsExecutionsAndSources() {
        val detail =
            RunDetailResponse(
                runId = "run-1",
                messageId = "msg-1",
                executions =
                    listOf(
                        execution(
                            toolCallId = "tc-1",
                            toolName = "web_search",
                            query = "kotlin multiplatform",
                        ),
                    ),
                sources =
                    listOf(
                        buildJsonObject {
                            put("title", "Example")
                            put("url", "https://example.com")
                            put("snippet", "snippet text")
                            put("retrievedAt", "2026-01-01T00:00:00Z")
                            put("kind", "clue")
                        },
                    ),
                blocks = emptyList(),
            )
        val wb = WorkbenchDetailProjector.fromRunDetail(detail)
        assertEquals("run-1", wb.runId)
        assertEquals(1, wb.toolExecutions.size)
        assertEquals("web_search", wb.toolExecutions.first().toolName)
        assertEquals("kotlin multiplatform", wb.toolExecutions.first().inputSummary)
        assertEquals(1, wb.sources.size)
        assertEquals("https://example.com", wb.sources.first().url)
        assertTrue(wb.workbenchCount >= 1)
    }

    @Test
    fun mergeDeliverables_preservesInitialView() {
        val incoming =
            WorkbenchDetailProjector.fromRunDetail(
                RunDetailResponse(
                    runId = "run-2",
                    messageId = "msg-2",
                    executions = listOf(execution(toolCallId = "tc-2", toolName = "bash", command = "ls")),
                ),
            )
        val previous = incoming.copy(initialView = "sources", initialSheetIndex = 0)
        val merged = WorkbenchDetailProjector.mergeDeliverables(incoming, previous)
        assertEquals("sources", merged.initialView)
        assertEquals(0, merged.initialSheetIndex)
        assertEquals(1, merged.toolExecutions.size)
    }

    private fun execution(
        toolCallId: String,
        toolName: String,
        query: String = "",
        command: String = "",
    ): JsonObject =
        buildJsonObject {
            put("toolCallId", toolCallId)
            put("toolName", toolName)
            put("status", "completed")
            put("startedAt", "2026-01-01T00:00:00Z")
            put("completedAt", "2026-01-01T00:00:01Z")
            put("durationMs", 1200)
            put(
                "input",
                buildJsonObject {
                    if (query.isNotEmpty()) put("query", query)
                    if (command.isNotEmpty()) put("command", command)
                },
            )
        }
}
