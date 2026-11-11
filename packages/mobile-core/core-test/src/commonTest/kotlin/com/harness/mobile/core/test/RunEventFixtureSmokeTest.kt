package com.harness.mobile.core.test

import com.harness.mobile.core.api.CreateRunResponse
import com.harness.mobile.core.api.RunStreamEvent
import com.harness.mobile.core.engine.RunLiveReducer
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.int
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put
import java.io.File
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

/**
 * B2：mobile-contract run-events fixture → [RunLiveReducer]（与 Web agent-run-state 对齐的 mobile 子集）。
 */
class RunEventFixtureSmokeTest {
    private val json = Json { ignoreUnknownKeys = true }
    private val reducer = RunLiveReducer()

    @Test
    fun messageDeltaSeq4FixtureAppendsHello() {
        val root = contractRoot()
        val raw = File(root, "fixtures/run-events/message-delta-seq4.json").readText()
        val rootObj = json.parseToJsonElement(raw).jsonObject
        val event = fixtureToRunStreamEvent(rootObj)
        val seq = event.seq

        var state =
            reducer.fromCreateRun(
                sessionId = event.sessionId,
                userText = "hi",
                response =
                    CreateRunResponse(
                        sessionId = event.sessionId,
                        runId = event.runId,
                        userMessageId = "u1",
                        assistantMessageId = "asst-1",
                        status = "running",
                        eventsUrl = "/events",
                    ),
            )

        state = state.copy(cursor = seq - 1)
        val result = reducer.applyEvent(state, event)
        assertTrue(!result.gap, "seq must follow cursor for incremental apply")
        state = result.state
        assertEquals("Hello", reducer.toConversation(state)[1].finalText)
        assertEquals(4, state.cursor)
    }

    private fun fixtureToRunStreamEvent(root: JsonObject): RunStreamEvent {
        val runId = root["runId"]?.jsonPrimitive?.content ?: error("runId")
        val seq = root["seq"]?.jsonPrimitive?.int ?: error("seq")
        val type = root["type"]?.jsonPrimitive?.content ?: error("type")
        val payload = root["payload"] ?: buildJsonObject {}
        return RunStreamEvent(
            seq = seq,
            sessionId = "s-fixture",
            runId = runId,
            type = type,
            payload = payload,
        )
    }

    @Test
    fun loadsFirstRunEventFixture() {
        val file = File(contractRoot(), "fixtures/run-events/message-delta-seq4.json")
        assertTrue(file.isFile, "missing ${file.absolutePath}")
        assertTrue(file.readText().contains("\"seq\": 4"))
    }

    private fun contractRoot(): String =
        System.getProperty("harness.mobileContractRoot")
            ?: error("Set harness.mobileContractRoot (Gradle jvmTest does this)")
}
