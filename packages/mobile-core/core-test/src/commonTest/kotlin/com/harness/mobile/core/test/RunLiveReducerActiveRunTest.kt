package com.harness.mobile.core.test

import com.harness.mobile.core.api.PersistedMessage
import com.harness.mobile.core.api.SessionActiveRun
import com.harness.mobile.core.api.SessionDetail
import com.harness.mobile.core.engine.RunLiveReducer
import kotlin.test.Test
import kotlin.test.assertEquals

class RunLiveReducerActiveRunTest {
    private val reducer = RunLiveReducer()

    @Test
    fun fromActiveRunUsesAssistantContentAndCursor() {
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
                            content = "question",
                            runId = "r1",
                            createdAt = "2026-01-01",
                        ),
                        PersistedMessage(
                            id = "a1",
                            sessionId = "s1",
                            role = "assistant",
                            kind = "text",
                            content = "partial",
                            runId = "r1",
                            deliveryStatus = "streaming",
                            createdAt = "2026-01-01",
                        ),
                    ),
            )
        val active =
            SessionActiveRun(
                runId = "r1",
                assistantMessageId = "a1",
                status = "running",
                lastEventSequence = 7,
            )
        val live = reducer.fromActiveRun(detail, active)
        assertEquals("r1", live.runId)
        assertEquals("partial", reducer.toConversation(live)[1].finalText)
        assertEquals("question", live.userText)
        assertEquals(7, live.cursor)
    }
}
