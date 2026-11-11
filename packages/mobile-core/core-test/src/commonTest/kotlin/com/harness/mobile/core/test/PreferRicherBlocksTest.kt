package com.harness.mobile.core.test

import com.harness.mobile.core.api.CreateRunResponse
import com.harness.mobile.core.api.RunSnapshot
import com.harness.mobile.core.api.RunStreamEvent
import com.harness.mobile.core.engine.RunLiveReducer
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import kotlinx.serialization.json.putJsonObject
import kotlin.test.Test
import kotlin.test.assertEquals

/** R6: snapshot must not replace richer live tool steps. */
class PreferRicherBlocksTest {
    private val reducer = RunLiveReducer()

    @Test
    fun snapshotWithOnlyReasoningDoesNotDropLiveToolStep() {
        var state =
            reducer.fromCreateRun(
                sessionId = "s1",
                userText = "search",
                response =
                    CreateRunResponse(
                        sessionId = "s1",
                        runId = "r1",
                        userMessageId = "u1",
                        assistantMessageId = "a1",
                        status = "running",
                        eventsUrl = "/events",
                    ),
            )
        state =
            reducer.applyEvent(
                state,
                RunStreamEvent(
                    seq = 1,
                    sessionId = "s1",
                    runId = "r1",
                    type = "reasoning.delta",
                    payload =
                        buildJsonObject {
                            put("type", "reasoning.delta")
                            put("messageId", "a1")
                            put("blockId", "reasoning-live")
                            put("delta", "live reasoning")
                            put("roundSequence", 1)
                            put("blockSequence", 0)
                        },
                ),
            ).state
        state =
            reducer.applyEvent(
                state,
                RunStreamEvent(
                    seq = 2,
                    sessionId = "s1",
                    runId = "r1",
                    type = "tool.started",
                    payload =
                        buildJsonObject {
                            put("type", "tool.started")
                            put("messageId", "a1")
                            put("blockId", "tool-1")
                            put("toolCallId", "call-live")
                            put("toolName", "web_search")
                            put("title", "搜索网页")
                            putJsonObject("input") { put("query", "live") }
                            put("roundSequence", 1)
                            put("blockSequence", 1)
                        },
                ),
            ).state

        val snapshot =
            RunSnapshot(
                runId = "r1",
                sessionId = "s1",
                status = "running",
                assistantMessageId = "a1",
                assistantContent = "",
                lastEventSequence = 5,
                blocks =
                    listOf(
                        buildJsonObject {
                            put("id", "reasoning-1")
                            put("type", "reasoning")
                            put("content", "snap")
                            put("roundSequence", 1)
                            put("blockSequence", 0)
                            put("durationMs", 100)
                            put("completedAt", "2026-01-01T00:00:01Z")
                        },
                    ),
            )

        val next = reducer.applySnapshot(state.copy(cursor = 3), snapshot)
        val assistant = reducer.toConversation(next)[1]
        assertEquals(listOf("reasoning", "tool"), assistant.process.map { it.kind })
        assertEquals("call-live", assistant.process.last { it.kind == "tool" }.id)
    }
}
