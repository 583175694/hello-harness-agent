package com.harness.mobile.core.test

import com.harness.mobile.core.api.RunStreamEvent
import com.harness.mobile.core.engine.isTerminalRunStreamEvent
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import kotlin.test.Test
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class RunStreamTerminalTest {
    private fun event(type: String, payload: kotlinx.serialization.json.JsonObject? = null): RunStreamEvent =
        RunStreamEvent(
            type = type,
            seq = 1,
            sessionId = "s1",
            runId = "r1",
            payload = payload,
        )

    @Test
    fun runLifecycleEventsAreTerminal() {
        assertTrue(isTerminalRunStreamEvent(event("run.completed")))
        assertTrue(isTerminalRunStreamEvent(event("run.failed")))
    }

    @Test
    fun snapshotStatusParsed() {
        assertTrue(
            isTerminalRunStreamEvent(
                event("run.snapshot", buildJsonObject { put("status", "failed") }),
            ),
        )
    }

    @Test
    fun snapshotDoesNotFalsePositiveOnContent() {
        assertFalse(
            isTerminalRunStreamEvent(
                event("run.snapshot", buildJsonObject { put("note", "not yet completed processing") }),
            ),
        )
    }
}
