package com.harness.mobile.core.engine

import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.int
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.longOrNull
import kotlinx.serialization.json.put

internal object ConversationBlocks {
    private const val MAX_ORDER = Int.MAX_VALUE

    fun orderAssistantBlocks(blocks: List<JsonObject>): List<JsonObject> =
        blocks.sortedWith(::compareBlockOrder)

    private fun compareBlockOrder(
        left: JsonObject,
        right: JsonObject,
    ): Int {
        val leftRound = left.roundSequence() ?: MAX_ORDER
        val rightRound = right.roundSequence() ?: MAX_ORDER
        if (leftRound != rightRound) return leftRound - rightRound
        val leftBlock = left.blockSequence() ?: MAX_ORDER
        val rightBlock = right.blockSequence() ?: MAX_ORDER
        return leftBlock - rightBlock
    }

    private fun JsonObject.roundSequence(): Int? =
        this["roundSequence"]?.jsonPrimitive?.content?.toIntOrNull()

    private fun JsonObject.blockSequence(): Int? =
        this["blockSequence"]?.jsonPrimitive?.content?.toIntOrNull()

    private fun JsonObject.blockType(): String? = this["type"]?.jsonPrimitive?.content

    private fun JsonObject.blockId(): String? = this["id"]?.jsonPrimitive?.content

    private fun insertOrdered(
        blocks: List<JsonObject>,
        block: JsonObject,
    ): List<JsonObject> {
        val roundSequence = block.roundSequence() ?: MAX_ORDER
        val blockSequence = block.blockSequence() ?: MAX_ORDER
        val index =
            blocks.indexOfFirst { current ->
                val currentRound = current.roundSequence() ?: MAX_ORDER
                val currentBlock = current.blockSequence() ?: MAX_ORDER
                currentRound > roundSequence ||
                    (currentRound == roundSequence && currentBlock > blockSequence)
            }
        return if (index < 0) {
            blocks + block
        } else {
            blocks.take(index) + block + blocks.drop(index)
        }
    }

    private fun conversationTextPhase(phase: String?): String? =
        when (phase) {
            "pending" -> "pending"
            "commentary" -> "process"
            "final_answer" -> "final"
            else -> null
        }

    fun appendTextDelta(
        blocks: List<JsonObject>,
        payload: JsonObject,
    ): List<JsonObject> {
        val blockId = payload["blockId"]?.jsonPrimitive?.content ?: return blocks
        val delta = payload["delta"]?.jsonPrimitive?.content ?: return blocks
        val phase = conversationTextPhase(payload["phase"]?.jsonPrimitive?.content)
        val index = blocks.indexOfFirst { it.blockId() == blockId && it.blockType() == AssistantBlockTypes.TEXT }
        if (index < 0) {
            val block =
                buildJsonObject {
                    put("id", blockId)
                    put("type", AssistantBlockTypes.TEXT)
                    put("content", delta)
                    payload["roundId"]?.jsonPrimitive?.content?.let { put("roundId", it) }
                    payload["roundSequence"]?.jsonPrimitive?.content?.toIntOrNull()?.let { put("roundSequence", it) }
                    payload["blockSequence"]?.jsonPrimitive?.content?.toIntOrNull()?.let { put("blockSequence", it) }
                    phase?.let { put("phase", it) }
                }
            return insertOrdered(blocks, block)
        }
        return orderAssistantBlocks(
            blocks.mapIndexed { blockIndex, block ->
                if (blockIndex != index) return@mapIndexed block
                buildJsonObject {
                    block.forEach { (key, value) ->
                        if (key != "content" && key != "phase") put(key, value)
                    }
                    put("id", blockId)
                    put("type", AssistantBlockTypes.TEXT)
                    put("content", block["content"]?.jsonPrimitive?.content.orEmpty() + delta)
                    payload["roundId"]?.jsonPrimitive?.content?.let { put("roundId", it) }
                    payload["roundSequence"]?.jsonPrimitive?.content?.toIntOrNull()?.let { put("roundSequence", it) }
                    payload["blockSequence"]?.jsonPrimitive?.content?.toIntOrNull()?.let { put("blockSequence", it) }
                    phase?.let { put("phase", it) }
                }
            },
        )
    }

    fun appendReasoningDelta(
        blocks: List<JsonObject>,
        payload: JsonObject,
    ): List<JsonObject> {
        val blockId = payload["blockId"]?.jsonPrimitive?.content ?: return blocks
        val delta = payload["delta"]?.jsonPrimitive?.content ?: return blocks
        val index = blocks.indexOfFirst { it.blockType() == AssistantBlockTypes.REASONING && it.blockId() == blockId }
        if (index < 0) {
            val block =
                buildJsonObject {
                    put("id", blockId)
                    put("type", AssistantBlockTypes.REASONING)
                    put("content", delta)
                    payload["roundId"]?.jsonPrimitive?.content?.let { put("roundId", it) }
                    payload["roundSequence"]?.jsonPrimitive?.content?.toIntOrNull()?.let { put("roundSequence", it) }
                    payload["blockSequence"]?.jsonPrimitive?.content?.toIntOrNull()?.let { put("blockSequence", it) }
                }
            return insertOrdered(blocks, block)
        }
        return orderAssistantBlocks(
            blocks.mapIndexed { i, block ->
                if (i != index) block
                else {
                    buildJsonObject {
                        block.forEach { (key, value) -> put(key, value) }
                        put("content", block["content"]?.jsonPrimitive?.content.orEmpty() + delta)
                    }
                }
            },
        )
    }

    fun completeReasoning(
        blocks: List<JsonObject>,
        roundSequence: Int,
        durationMs: Long,
    ): List<JsonObject> =
        blocks.map { block ->
            if (block.blockType() == AssistantBlockTypes.REASONING &&
                block.roundSequence() == roundSequence
            ) {
                buildJsonObject {
                    block.forEach { (key, value) -> put(key, value) }
                    put("durationMs", durationMs)
                    put("completedAt", "1970-01-01T00:00:00.000Z")
                }
            } else {
                block
            }
        }

    fun completeTextPhase(
        blocks: List<JsonObject>,
        payload: JsonObject,
    ): List<JsonObject> {
        val blockId = payload["blockId"]?.jsonPrimitive?.content ?: return blocks
        val phaseRaw = payload["phase"]?.jsonPrimitive?.content ?: return blocks
        val phase =
            when (phaseRaw) {
                "commentary" -> "process"
                "final_answer" -> "final"
                else -> return blocks
            }
        return blocks.map { block ->
            if (block.blockType() == AssistantBlockTypes.TEXT && block.blockId() == blockId) {
                buildJsonObject {
                    block.forEach { (key, value) -> put(key, value) }
                    put("phase", phase)
                }
            } else {
                block
            }
        }
    }

    fun discardTextBlock(
        blocks: List<JsonObject>,
        payload: JsonObject,
    ): List<JsonObject> {
        val blockId = payload["blockId"]?.jsonPrimitive?.content ?: return blocks
        return blocks.filterNot { it.blockType() == AssistantBlockTypes.TEXT && it.blockId() == blockId }
    }

    fun applyToolActivityEvent(
        blocks: List<JsonObject>,
        eventType: String,
        payload: JsonObject,
    ): List<JsonObject> {
        val toolCallId = payload["toolCallId"]?.jsonPrimitive?.content ?: return blocks
        val index = blocks.indexOfFirst { it.blockType() == AssistantBlockTypes.TOOL && it.toolCallId() == toolCallId }

        if (eventType == "tool.started") {
            if (index >= 0) {
                return orderAssistantBlocks(
                    blocks.mapIndexed { blockIndex, block ->
                        if (blockIndex != index) block
                        else patchToolRoundFields(block, payload)
                    },
                )
            }
            val toolName = payload["toolName"]?.jsonPrimitive?.content.orEmpty()
            val title = payload["title"]?.jsonPrimitive?.content ?: toolName
            val summary = toolStartSummary(toolName, payload["input"]?.jsonObject)
            val block =
                buildJsonObject {
                    put("id", payload["blockId"]?.jsonPrimitive?.content.orEmpty())
                    put("type", AssistantBlockTypes.TOOL)
                    put("toolCallId", toolCallId)
                    put("toolName", toolName)
                    put("title", title)
                    put("summary", summary)
                    put("status", "running")
                    payload["startedAt"]?.jsonPrimitive?.content?.let { put("startedAt", it) }
                    payload["roundId"]?.jsonPrimitive?.content?.let { put("roundId", it) }
                    payload["roundSequence"]?.jsonPrimitive?.content?.toIntOrNull()?.let { put("roundSequence", it) }
                    payload["blockSequence"]?.jsonPrimitive?.content?.toIntOrNull()?.let { put("blockSequence", it) }
                }
            return insertOrdered(blocks, block)
        }

        if (index < 0) return blocks

        val status =
            when (eventType) {
                "tool.completed" -> "completed"
                "tool.failed" -> "failed"
                "tool.cancelled" -> "cancelled"
                else -> return blocks
            }
        return orderAssistantBlocks(
            blocks.mapIndexed { blockIndex, block ->
                if (blockIndex != index || block.blockType() != AssistantBlockTypes.TOOL) return@mapIndexed block
                val currentSummary = block["summary"]?.jsonPrimitive?.content.orEmpty()
                val toolName = block["toolName"]?.jsonPrimitive?.content.orEmpty()
                val nextSummary =
                    if (eventType == "tool.completed" && toolName == "web_search") {
                        currentSummary
                    } else {
                        payload["detail"]?.jsonPrimitive?.content ?: currentSummary
                    }
                buildJsonObject {
                    block.forEach { (key, value) -> put(key, value) }
                    put("status", status)
                    put("summary", nextSummary)
                    payload["completedAt"]?.jsonPrimitive?.content?.let { put("completedAt", it) }
                    payload["durationMs"]?.jsonPrimitive?.longOrNull?.let { put("durationMs", it) }
                }
            },
        )
    }

    private fun JsonObject.toolCallId(): String? =
        this["toolCallId"]?.jsonPrimitive?.content ?: this["id"]?.jsonPrimitive?.content

    private fun patchToolRoundFields(
        block: JsonObject,
        payload: JsonObject,
    ): JsonObject =
        buildJsonObject {
            block.forEach { (key, value) -> put(key, value) }
            payload["roundId"]?.jsonPrimitive?.content?.let { put("roundId", it) }
            payload["roundSequence"]?.jsonPrimitive?.content?.toIntOrNull()?.let { put("roundSequence", it) }
            payload["blockSequence"]?.jsonPrimitive?.content?.toIntOrNull()?.let { put("blockSequence", it) }
        }

    private fun toolStartSummary(
        toolName: String,
        input: JsonObject?,
    ): String {
        if (toolName == "web_search") {
            return input?.get("query")?.jsonPrimitive?.content.orEmpty()
        }
        return input?.get("query")?.jsonPrimitive?.content.orEmpty()
    }

    fun blocksFromJsonElements(elements: List<kotlinx.serialization.json.JsonElement>): List<JsonObject> =
        elements.mapNotNull { it as? JsonObject }

    fun blocksFromMetadata(metadata: JsonObject): List<JsonObject> {
        val array = metadata["blocks"] as? kotlinx.serialization.json.JsonArray ?: return emptyList()
        return array.mapNotNull { it as? JsonObject }
    }
}
