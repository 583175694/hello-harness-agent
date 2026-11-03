package com.harness.mobile.core.test

import com.harness.mobile.core.engine.InterruptPayloadParser
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import kotlinx.serialization.json.putJsonArray
import kotlinx.serialization.json.putJsonObject

class InterruptPayloadParserTest {
    private val json = Json { ignoreUnknownKeys = true }

    @Test
    fun parsesClarificationInterrupt() {
        val payload =
            buildJsonObject {
                putJsonObject("interrupt") {
                    put("interruptId", "int-1")
                    put("kind", "clarification")
                    put("status", "pending")
                    putJsonObject("payload") {
                        put("question", "Pick one?")
                        putJsonArray("options") { add(json.parseToJsonElement("\"A\"")) }
                        put("allowFreeText", true)
                    }
                }
            }
        val pending = InterruptPayloadParser.fromEventPayload(payload)
        assertNotNull(pending)
        assertEquals("int-1", pending?.clarification?.interruptId)
        assertEquals("Pick one?", pending?.clarification?.question)
    }
}
