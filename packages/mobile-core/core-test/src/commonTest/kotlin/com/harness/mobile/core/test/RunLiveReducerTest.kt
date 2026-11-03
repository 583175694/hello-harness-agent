package com.harness.mobile.core.test

import com.harness.mobile.core.api.CreateRunResponse
import com.harness.mobile.core.api.PersistedMessage
import com.harness.mobile.core.api.RunSnapshot
import com.harness.mobile.core.api.RunStreamEvent
import com.harness.mobile.core.api.SessionActiveRun
import com.harness.mobile.core.api.SessionDetail
import com.harness.mobile.core.engine.RunLiveReducer
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import kotlinx.serialization.json.putJsonObject
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class RunLiveReducerTest {
    private val reducer = RunLiveReducer()

    @Test
    fun messageDeltaAppendsFinalText() {
        var state =
            reducer.fromCreateRun(
                sessionId = "s1",
                userText = "hi",
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
        val result =
            reducer.applyEvent(
                state,
                RunStreamEvent(
                    seq = 1,
                    sessionId = "s1",
                    runId = "r1",
                    type = "message.delta",
                    payload =
                        buildJsonObject {
                            put("type", "message.delta")
                            put("messageId", "a1")
                            put("blockId", "text-1")
                            put("delta", "Hello")
                            put("phase", "final_answer")
                        },
                ),
            )
        val assistant = reducer.toConversation(result.state)[1]
        assertEquals("Hello", assistant.finalText)
        assertEquals(1, result.state.cursor)
    }

    @Test
    fun duplicateSeqIgnored() {
        val state =
            reducer.fromCreateRun(
                "s1",
                "hi",
                CreateRunResponse("s1", "r1", "u1", "a1", "running", "/e"),
            ).copy(cursor = 3)
        val result =
            reducer.applyEvent(
                state,
                RunStreamEvent(2, "s1", "r1", "message.delta", buildJsonObject { put("delta", "x") }),
            )
        assertTrue(result.duplicate)
    }

    @Test
    fun gapSeqDoesNotAdvanceCursor() {
        val state =
            reducer.fromCreateRun(
                "s1",
                "hi",
                CreateRunResponse("s1", "r1", "u1", "a1", "running", "/e"),
            ).copy(cursor = 3)
        val result =
            reducer.applyEvent(
                state,
                RunStreamEvent(5, "s1", "r1", "message.delta", buildJsonObject { put("delta", "x") }),
            )
        assertTrue(result.gap)
        assertEquals(3, result.state.cursor)
    }

    @Test
    fun applySnapshotHydratesActiveInterrupt() {
        val state =
            reducer.fromCreateRun(
                sessionId = "s1",
                userText = "hi",
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
        val snapshot =
            RunSnapshot(
                runId = "r1",
                sessionId = "s1",
                status = "running",
                assistantMessageId = "a1",
                assistantContent = "partial",
                lastEventSequence = 5,
                activeInterrupt =
                    buildJsonObject {
                        put("interruptId", "int-1")
                        put("kind", "clarification")
                        put("status", "pending")
                        putJsonObject("payload") {
                            put("question", "Which?")
                            put("allowFreeText", true)
                        }
                    },
            )
        val next = reducer.applySnapshot(state, snapshot)
        assertEquals("partial", reducer.toConversation(next)[1].finalText)
        assertEquals(5, next.cursor)
        assertEquals("Which?", next.composerClarification?.question)
        assertEquals("int-1", next.composerClarification?.interruptId)
    }

    @Test
    fun toolStartedTracksLatestToolWithoutUiAutoOpenState() {
        val state =
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
        val first =
            reducer.applyEvent(
                state,
                RunStreamEvent(
                    seq = 1,
                    sessionId = "s1",
                    runId = "r1",
                    type = "tool.started",
                    payload = buildJsonObject { put("toolCallId", "tc-1") },
                ),
            )
        assertEquals("tc-1", first.state.latestToolCallId)
        val second =
            reducer.applyEvent(
                first.state,
                RunStreamEvent(
                    seq = 2,
                    sessionId = "s1",
                    runId = "r1",
                    type = "tool.started",
                    payload = buildJsonObject { put("toolCallId", "tc-2") },
                ),
            )
        assertEquals("tc-2", second.state.latestToolCallId)
    }

    @Test
    fun reasoningDeltaIsPreservedForNativeTimeline() {
        val state =
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
        val result =
            reducer.applyEvent(
                state,
                RunStreamEvent(
                    seq = 1,
                    sessionId = "s1",
                    runId = "r1",
                    type = "reasoning.delta",
                    payload =
                        buildJsonObject {
                            put("blockId", "reasoning-live")
                            put("delta", "先检索再总结")
                        },
                ),
            )
        val assistant = reducer.toConversation(result.state)[1]
        assertEquals("先检索再总结", assistant.reasoning)
        assertEquals("reasoning", assistant.process.single().kind)
        assertEquals("先检索再总结", assistant.process.single().content)
        assertTrue(assistant.process.single().streaming)
    }

    @Test
    fun runFailedEventMarksTerminalDelivery() {
        val state =
            reducer.fromCreateRun(
                sessionId = "s1",
                userText = "hi",
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
        val result =
            reducer.applyEvent(
                state,
                RunStreamEvent(
                    seq = 1,
                    sessionId = "s1",
                    runId = "r1",
                    type = "run.failed",
                    payload = buildJsonObject { put("status", "failed") },
                ),
            )
        assertEquals("failed", result.state.deliveryStatus)
    }

    /** E12：API 重启后 activeRun 收敛为 failed（含 RUN_INTERRUPTED），不假 streaming。 */
    @Test
    fun fromActiveRunFailedStatusIsTerminal() {
        val detail =
            SessionDetail(
                id = "s1",
                title = "t",
                createdAt = "2026-01-01",
                updatedAt = "2026-01-01",
                messages =
                    listOf(
                        PersistedMessage(
                            id = "u1",
                            sessionId = "s1",
                            role = "user",
                            kind = "text",
                            content = "q",
                            runId = "r1",
                            createdAt = "2026-01-01T00:00:00Z",
                        ),
                        PersistedMessage(
                            id = "a1",
                            sessionId = "s1",
                            role = "assistant",
                            kind = "text",
                            content = "partial",
                            runId = "r1",
                            deliveryStatus = "failed",
                            createdAt = "2026-01-01T00:00:01Z",
                        ),
                    ),
                activeRun =
                    SessionActiveRun(
                        runId = "r1",
                        assistantMessageId = "a1",
                        status = "failed",
                        lastEventSequence = 42,
                    ),
            )
        val live = reducer.fromActiveRun(detail, detail.activeRun!!)
        assertEquals("failed", live.deliveryStatus)
        assertEquals(42, live.cursor)
        assertEquals("partial", reducer.toConversation(live)[1].finalText)
    }

    @Test
    fun snapshotReasoningHydratesLiveTimelineWithoutReplayingDeltas() {
        val state =
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
            ).copy(cursor = 8)
        val snapshot =
            RunSnapshot(
                runId = "r1",
                sessionId = "s1",
                status = "running",
                assistantMessageId = "a1",
                assistantContent = "工具结果",
                lastEventSequence = 12,
                blocks =
                    listOf(
                        buildJsonObject {
                            put("id", "reasoning-1")
                            put("type", "reasoning")
                            put("roundId", "round-1")
                            put("roundSequence", 1)
                            put("blockSequence", 0)
                            put("content", "先检索")
                            put("durationMs", 300)
                            put("completedAt", "2026-01-01T00:00:01Z")
                        },
                        buildJsonObject {
                            put("id", "tool-1")
                            put("type", "tool_activity")
                            put("toolCallId", "call-1")
                            put("toolName", "web_search")
                            put("status", "running")
                        },
                    ),
            )

        val next = reducer.applySnapshot(state, snapshot)
        val assistant = reducer.toConversation(next)[1]

        assertEquals("先检索", assistant.reasoning)
        assertEquals(listOf("reasoning", "tool"), assistant.process.map { it.kind })
        assertEquals(300L, assistant.process.first().durationMs)
        assertEquals(false, assistant.process.first().streaming)
        assertEquals(12, next.cursor)
    }

    @Test
    fun roundCompletionStopsStreamingReasoningAndKeepsDuration() {
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
                            put("blockId", "reasoning-1")
                            put("delta", "先检索")
                            put("roundSequence", 1)
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
                    type = "model.round.completed",
                    payload =
                        buildJsonObject {
                            putJsonObject("observation") {
                                put("roundSequence", 1)
                                put("durationMs", 450)
                            }
                        },
                ),
            ).state

        val assistant = reducer.toConversation(state)[1].process.single()
        assertEquals(false, assistant.streaming)
        assertEquals(450L, assistant.durationMs)
        assertEquals("先检索", assistant.content)
    }
}
