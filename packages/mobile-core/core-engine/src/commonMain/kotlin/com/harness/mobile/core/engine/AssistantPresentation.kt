package com.harness.mobile.core.engine

import com.harness.mobile.core.api.MobileProcessBlock
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.longOrNull

data class AssistantMessagePresentation(
    val process: List<MobileProcessBlock>,
    val pendingText: String,
    val finalText: String,
    val artifacts: List<com.harness.mobile.core.api.ArtifactRef> = emptyList(),
)

internal object AssistantPresentation {
    fun presentAssistantBlocks(blocks: List<JsonObject>): AssistantMessagePresentation {
        val timeline =
            blocks.filter { block ->
                val type = block["type"]?.jsonPrimitive?.content
                type == AssistantBlockTypes.TEXT ||
                    type == AssistantBlockTypes.TOOL ||
                    type == AssistantBlockTypes.REASONING ||
                    type == AssistantBlockTypes.ARTIFACT
            }
        val toolRounds =
            timeline
                .mapNotNull { block ->
                    if (block["type"]?.jsonPrimitive?.content != AssistantBlockTypes.TOOL) return@mapNotNull null
                    block["roundSequence"]?.jsonPrimitive?.content?.toIntOrNull()
                }.toSet()
        val lastToolIndex =
            timeline.indexOfLast { it["type"]?.jsonPrimitive?.content == AssistantBlockTypes.TOOL }
        val process = mutableListOf<MobileProcessBlock>()
        val pending = mutableListOf<String>()
        val final = mutableListOf<String>()
        val artifacts = mutableListOf<com.harness.mobile.core.api.ArtifactRef>()

        timeline.forEachIndexed { index, block ->
            when (block["type"]?.jsonPrimitive?.content) {
                AssistantBlockTypes.TOOL -> {
                    process +=
                        MobileProcessBlock(
                            kind = "tool",
                            id = block.toolCallId().orEmpty(),
                            name = block["title"]?.jsonPrimitive?.content
                                ?: block["toolName"]?.jsonPrimitive?.content.orEmpty(),
                            summary = block["summary"]?.jsonPrimitive?.content.orEmpty(),
                            status = block["status"]?.jsonPrimitive?.content.orEmpty(),
                            durationMs = block["durationMs"]?.jsonPrimitive?.longOrNull,
                        )
                }
                AssistantBlockTypes.REASONING -> {
                    val completedAt = block["completedAt"]?.jsonPrimitive?.content
                    process +=
                        MobileProcessBlock(
                            kind = "reasoning",
                            id = block.blockId().orEmpty(),
                            content = block["content"]?.jsonPrimitive?.content.orEmpty(),
                            durationMs = block["durationMs"]?.jsonPrimitive?.longOrNull,
                            streaming = completedAt == null,
                            roundSequence = block["roundSequence"]?.jsonPrimitive?.content?.toIntOrNull(),
                        )
                }
                AssistantBlockTypes.ARTIFACT -> {
                    artifacts +=
                        com.harness.mobile.core.api.ArtifactRef(
                            artifactId = block["artifactId"]?.jsonPrimitive?.content.orEmpty(),
                            fileId = block["fileId"]?.jsonPrimitive?.content.orEmpty(),
                            fileName = block["fileName"]?.jsonPrimitive?.content.orEmpty(),
                            mediaType = block["mediaType"]?.jsonPrimitive?.content.orEmpty(),
                            fileKind = block["fileKind"]?.jsonPrimitive?.content.orEmpty(),
                            size = block["size"]?.jsonPrimitive?.content?.toIntOrNull() ?: 0,
                            status = block["status"]?.jsonPrimitive?.content.orEmpty(),
                            createdAt = block["createdAt"]?.jsonPrimitive?.content.orEmpty(),
                            seriesId = block["seriesId"]?.jsonPrimitive?.content,
                            logicalName = block["logicalName"]?.jsonPrimitive?.content,
                            versionNumber = block["versionNumber"]?.jsonPrimitive?.content?.toIntOrNull(),
                            isCurrent = block["isCurrent"]?.jsonPrimitive?.content?.toBooleanStrictOrNull(),
                        )
                }
                AssistantBlockTypes.TEXT -> {
                    val phase = block["phase"]?.jsonPrimitive?.content
                    val content = block["content"]?.jsonPrimitive?.content.orEmpty()
                    when (phase) {
                        "pending" -> pending += content
                        "process" -> process += MobileProcessBlock(kind = "text", id = block.blockId().orEmpty(), content = content)
                        "final" -> final += content
                        else -> {
                            val roundSequence = block["roundSequence"]?.jsonPrimitive?.content?.toIntOrNull()
                            val belongsToToolRound = roundSequence != null && toolRounds.contains(roundSequence)
                            val legacyProcessText = roundSequence == null && index <= lastToolIndex
                            if (belongsToToolRound || legacyProcessText) {
                                process += MobileProcessBlock(kind = "text", id = block.blockId().orEmpty(), content = content)
                            } else {
                                final += content
                            }
                        }
                    }
                }
            }
        }

        return AssistantMessagePresentation(
            process = process,
            pendingText = pending.joinToString(""),
            finalText = final.joinToString(""),
            artifacts = artifacts,
        )
    }

    private fun JsonObject.blockId(): String? = this["id"]?.jsonPrimitive?.content

    private fun JsonObject.toolCallId(): String? =
        this["toolCallId"]?.jsonPrimitive?.content ?: this["id"]?.jsonPrimitive?.content
}
