package com.harness.mobile.core.engine

import com.harness.mobile.core.api.MobileComposerClarification
import com.harness.mobile.core.api.MobileComposerToolApproval
import com.harness.mobile.core.api.MobileComposerToolApprovalItem
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive

object InterruptPayloadParser {
    data class PendingInterrupt(
        val clarification: MobileComposerClarification? = null,
        val toolApproval: MobileComposerToolApproval? = null,
    )

    fun fromEventPayload(payload: JsonElement?): PendingInterrupt? {
        val root = payload?.jsonObject ?: return null
        val interrupt =
            root["interrupt"]?.jsonObject
                ?: root["control"]?.jsonObject?.get("activeInterrupt")?.jsonObject
                ?: return null
        return fromInterruptObject(interrupt)
    }

    fun fromInterruptObject(interrupt: JsonObject): PendingInterrupt? {
        val status = interrupt.string("status") ?: return null
        if (status != "pending") return null
        return when (interrupt.string("kind")) {
            "clarification" -> parseClarification(interrupt)?.let { PendingInterrupt(clarification = it) }
            "tool_approval" -> parseToolApproval(interrupt)?.let { PendingInterrupt(toolApproval = it) }
            else -> null
        }
    }

    private fun parseClarification(interrupt: JsonObject): MobileComposerClarification? {
        val interruptId = interrupt.string("interruptId") ?: return null
        val payload = interrupt["payload"]?.jsonObject ?: return null
        val question = payload.string("question") ?: return null
        val options =
            payload["options"]?.jsonArray?.mapNotNull { element ->
                (element as? JsonPrimitive)?.content?.takeIf { it.isNotBlank() }
            }.orEmpty()
        val allowFreeText = payload["allowFreeText"]?.jsonPrimitive?.content?.toBooleanStrictOrNull() ?: true
        return MobileComposerClarification(
            interruptId = interruptId,
            question = question,
            options = options,
            allowFreeText = allowFreeText,
        )
    }

    private fun parseToolApproval(interrupt: JsonObject): MobileComposerToolApproval? {
        val interruptId = interrupt.string("interruptId") ?: return null
        val itemsArray = interrupt["payload"]?.jsonObject?.get("items")?.jsonArray ?: return null
        val items =
            itemsArray.mapNotNull { element ->
                val item = element.jsonObject
                val itemId = item.string("itemId") ?: return@mapNotNull null
                val toolCallId = item.string("toolCallId") ?: return@mapNotNull null
                val toolName = item.string("toolName") ?: return@mapNotNull null
                val argumentsHash = item.string("argumentsHash") ?: return@mapNotNull null
                val input = item["input"]
                val command = summarizeToolInput(input)
                MobileComposerToolApprovalItem(
                    itemId = itemId,
                    toolName = toolName,
                    command = command,
                    toolCallId = toolCallId,
                    argumentsHash = argumentsHash,
                )
            }
        if (items.isEmpty()) return null
        return MobileComposerToolApproval(
            interruptId = interruptId,
            items = items,
        )
    }

    private fun summarizeToolInput(input: JsonElement?): String {
        if (input == null) return ""
        return when (input) {
            is JsonPrimitive -> input.content
            is JsonObject ->
                input["command"]?.jsonPrimitive?.content
                    ?: input["fileName"]?.jsonPrimitive?.content
                    ?: input.toString()
            else -> input.toString()
        }
    }

    private fun JsonObject.string(key: String): String? =
        this[key]?.jsonPrimitive?.content?.trim()?.takeIf { it.isNotEmpty() }
}
