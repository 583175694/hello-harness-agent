package com.harness.mobile.core.engine

import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonPrimitive

internal object ApplyRunSnapshotBlocks {
    /** Aligns with TS [preferRicherAssistant] block count rule (R6). */
    fun preferRicherBlocks(
        current: List<JsonObject>,
        incoming: List<JsonObject>,
    ): List<JsonObject> =
        when {
            current.size > incoming.size -> current
            incoming.isEmpty() -> current
            current.isEmpty() -> incoming
            current.size == incoming.size -> mergeSameSize(current, incoming)
            else -> incoming
        }

    private fun mergeSameSize(
        current: List<JsonObject>,
        incoming: List<JsonObject>,
    ): List<JsonObject> =
        incoming.indices.map { index ->
            preferRicherBlock(current[index], incoming[index])
        }

    private fun preferRicherBlock(
        current: JsonObject,
        incoming: JsonObject,
    ): JsonObject {
        val currentId = current["id"]?.jsonPrimitive?.content
        val incomingId = incoming["id"]?.jsonPrimitive?.content
        if (currentId != null && incomingId != null && currentId != incomingId) {
            return incoming
        }
        val currentContent = current["content"]?.jsonPrimitive?.content.orEmpty()
        val incomingContent = incoming["content"]?.jsonPrimitive?.content.orEmpty()
        return if (currentContent.length >= incomingContent.length) current else incoming
    }
}
