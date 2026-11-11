package com.harness.mobile.core.engine

import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.longOrNull

internal object ApplyRunEventConversation {
    fun apply(
        blocks: List<JsonObject>,
        eventType: String,
        payload: JsonObject?,
    ): List<JsonObject> {
        val body = payload ?: return blocks
        return when (eventType) {
            "message.delta" -> ConversationBlocks.appendTextDelta(blocks, body)
            "message.phase.completed" -> ConversationBlocks.completeTextPhase(blocks, body)
            "message.discarded" -> ConversationBlocks.discardTextBlock(blocks, body)
            "reasoning.delta" -> ConversationBlocks.appendReasoningDelta(blocks, body)
            "model.round.completed" -> {
                val roundSequence =
                    body["observation"]
                        ?.jsonObject
                        ?.get("roundSequence")
                        ?.jsonPrimitive
                        ?.content
                        ?.toIntOrNull()
                val durationMs =
                    body["observation"]
                        ?.jsonObject
                        ?.get("durationMs")
                        ?.jsonPrimitive
                        ?.longOrNull
                if (roundSequence != null && durationMs != null) {
                    ConversationBlocks.completeReasoning(blocks, roundSequence, durationMs)
                } else {
                    blocks
                }
            }
            "tool.started", "tool.completed", "tool.failed", "tool.cancelled" ->
                ConversationBlocks.applyToolActivityEvent(blocks, eventType, body)
            else -> blocks
        }
    }
}
