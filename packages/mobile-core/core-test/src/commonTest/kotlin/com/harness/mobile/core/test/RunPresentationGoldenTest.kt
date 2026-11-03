package com.harness.mobile.core.test

import com.harness.mobile.core.api.CreateRunResponse
import com.harness.mobile.core.api.MobileConversationLine
import com.harness.mobile.core.api.RunStreamEvent
import com.harness.mobile.core.engine.RunLiveReducer
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.boolean
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import java.io.File
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

// §5.11 S1–S3: KMP presentation must match TS fixtures/run-events/expected/
class RunPresentationGoldenTest {
    private val json = Json { ignoreUnknownKeys = true }
    private val reducer = RunLiveReducer()

    @Test
    fun s1ReasoningToolFinal() = goldenScenario("s1-reasoning-tool-final.json", "s1.json")

    @Test
    fun s2CommentaryToolPhase() = goldenScenario("s2-commentary-tool-phase.json", "s2.json")

    @Test
    fun s3MultiRoundFinal() = goldenScenario("s3-multi-round-final.json", "s3.json")

    @Test
    fun s3MidRunProjectsFinalTextWhileStreaming() {
        val root = contractRoot()
        val fixture =
            json.parseToJsonElement(
                File(root, "fixtures/run-events/s3-multi-round-final.json").readText(),
            ).jsonObject
        val events = fixture["events"]?.jsonArray ?: error("events")
        var state =
            reducer.fromCreateRun(
                sessionId = "s-golden",
                userText = "hi",
                response =
                    CreateRunResponse(
                        sessionId = "s-golden",
                        runId = "run-golden-s3",
                        userMessageId = "u1",
                        assistantMessageId = "asst-1",
                        status = "running",
                        eventsUrl = "/events",
                    ),
            )
        for (element in events) {
            val eventObj = element.jsonObject
            val seq = eventObj["seq"]?.jsonPrimitive?.content?.toIntOrNull() ?: error("seq")
            if (seq > 9) break
            val event =
                RunStreamEvent(
                    seq = seq,
                    sessionId = "s-golden",
                    runId = "run-golden-s3",
                    type = eventObj["type"]?.jsonPrimitive?.content ?: error("type"),
                    payload = eventObj["payload"],
                )
            state = reducer.applyEvent(state, event).state
        }
        val assistant = reducer.toConversation(state).single { it.kind == "assistant" }
        assertEquals("streaming", assistant.deliveryStatus)
        assertEquals(true, assistant.pending)
        assertTrue(assistant.finalText.orEmpty().contains("第一轮结论"))
        assertTrue(assistant.finalText.orEmpty().contains("第二轮结论"))
    }

    private fun goldenScenario(
        fixtureFile: String,
        expectedFile: String,
    ) {
        val root = contractRoot()
        val fixture = json.parseToJsonElement(File(root, "fixtures/run-events/$fixtureFile").readText()).jsonObject
        val expected = json.parseToJsonElement(File(root, "fixtures/run-events/expected/$expectedFile").readText()).jsonObject

        val assistantMessageId = fixture["assistantMessageId"]?.jsonPrimitive?.content ?: error("assistantMessageId")
        val sessionId = fixture["sessionId"]?.jsonPrimitive?.content ?: "s-golden"
        val runId = fixture["runId"]?.jsonPrimitive?.content ?: error("runId")
        val events = fixture["events"]?.jsonArray ?: error("events")

        var state =
            reducer.fromCreateRun(
                sessionId = sessionId,
                userText = "hi",
                response =
                    CreateRunResponse(
                        sessionId = sessionId,
                        runId = runId,
                        userMessageId = "u1",
                        assistantMessageId = assistantMessageId,
                        status = "running",
                        eventsUrl = "/events",
                    ),
            )

        for (element in events) {
            val eventObj = element.jsonObject
            val event =
                RunStreamEvent(
                    seq = eventObj["seq"]?.jsonPrimitive?.content?.toIntOrNull() ?: error("seq"),
                    sessionId = sessionId,
                    runId = eventObj["runId"]?.jsonPrimitive?.content ?: runId,
                    type = eventObj["type"]?.jsonPrimitive?.content ?: error("type"),
                    payload = eventObj["payload"],
                )
            val result = reducer.applyEvent(state, event)
            assertEquals(false, result.duplicate, "duplicate at seq ${event.seq}")
            assertEquals(false, result.gap, "gap at seq ${event.seq}")
            state = result.state
        }

        val assistant = reducer.toConversation(state).single { it.kind == "assistant" }
        assertPresentationEquals(expected, assistant)
    }

    private fun assertPresentationEquals(
        expected: JsonObject,
        line: MobileConversationLine,
    ) {
        assertEquals(expected["pending"]?.jsonPrimitive?.boolean, line.pending)
        assertEquals(expected["deliveryStatus"]?.jsonPrimitive?.content, line.deliveryStatus)
        assertEquals(expected["pendingText"]?.jsonPrimitive?.content.orEmpty(), line.pendingText.orEmpty())
        assertEquals(expected["finalText"]?.jsonPrimitive?.content.orEmpty(), line.finalText.orEmpty())
        val expectedProcess = expected["process"]?.jsonArray ?: error("process")
        assertEquals(expectedProcess.size, line.process.size)
        expectedProcess.forEachIndexed { index, element ->
            val item = element.jsonObject
            val block = line.process[index]
            assertEquals(item["kind"]?.jsonPrimitive?.content, block.kind)
            when (block.kind) {
                "reasoning" -> {
                    assertEquals(item["content"]?.jsonPrimitive?.content, block.content)
                    assertEquals(item["streaming"]?.jsonPrimitive?.boolean, block.streaming)
                    val duration = item["durationMs"]
                    if (duration != null && !duration.jsonPrimitive.isString) {
                        assertEquals(duration.jsonPrimitive.content.toLongOrNull(), block.durationMs)
                    }
                }
                "tool" -> {
                    assertEquals(item["id"]?.jsonPrimitive?.content, block.id)
                    assertEquals(item["name"]?.jsonPrimitive?.content, block.name)
                    assertEquals(item["status"]?.jsonPrimitive?.content, block.status)
                    assertEquals(item["summary"]?.jsonPrimitive?.content.orEmpty(), block.summary)
                }
                "text" -> assertEquals(item["content"]?.jsonPrimitive?.content, block.content)
            }
        }
    }

    private fun contractRoot(): String =
        System.getProperty("harness.mobileContractRoot")
            ?: error("Set harness.mobileContractRoot (Gradle jvmTest does this)")
}
