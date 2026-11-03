package com.harness.mobile.core.engine

import com.harness.mobile.core.api.MobileActiveSessionSnapshot
import com.harness.mobile.core.api.MobileConversationLine
import com.harness.mobile.core.api.MobileFollowUpRow
import com.harness.mobile.core.api.MobileProcessBlock
import com.harness.mobile.core.api.MobileSessionDrawerRow
import com.harness.mobile.core.api.PersistedMessage
import com.harness.mobile.core.api.SessionDetail
import com.harness.mobile.core.api.SessionSummary
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.longOrNull

object SessionSnapshotProjector {
    fun sortSummaries(sessions: List<SessionSummary>): List<SessionSummary> =
        sessions.sortedWith(
            compareByDescending<SessionSummary> { it.isPinned }
                .thenByDescending { it.updatedAt },
        )

    fun drawerRows(
        summaries: List<SessionSummary>,
        selectedId: String?,
        runningSessionIds: Set<String>,
    ): List<MobileSessionDrawerRow> =
        sortSummaries(summaries).map { summary ->
            MobileSessionDrawerRow(
                id = summary.id,
                title = summary.title,
                timeLabel = formatUpdatedAt(summary.updatedAt),
                active = summary.id == selectedId,
                pinned = summary.isPinned,
                running = summary.id in runningSessionIds,
            )
        }

    fun landingSnapshot(
        summaries: List<SessionSummary>,
        selectedId: String?,
        runningSessionIds: Set<String>,
    ): MobileActiveSessionSnapshot =
        MobileActiveSessionSnapshot(
            sessionId = null,
            title = "新对话",
            isLanding = true,
            drawerSessions = drawerRows(summaries, selectedId, runningSessionIds),
            conversation = emptyList(),
        )

    fun fromDetail(
        detail: SessionDetail,
        summaries: List<SessionSummary>,
        runningSessionIds: Set<String>,
    ): MobileActiveSessionSnapshot {
        val running = detail.activeRun != null
        val runningIds =
            if (running) {
                runningSessionIds + detail.id
            } else {
                runningSessionIds - detail.id
            }
        return MobileActiveSessionSnapshot(
            sessionId = detail.id,
            title = detail.title,
            isLanding = detail.messages.isEmpty(),
            drawerSessions = drawerRows(summaries, detail.id, runningIds),
            conversation = detail.messages.mapNotNull(::toConversationLine),
            followUps = followUpsFromDetail(detail),
            canLoadOlderMessages = detail.pagination?.hasMore == true ||
                !detail.pagination?.nextBefore.isNullOrBlank(),
        )
    }

    fun followUpsFromDetail(detail: SessionDetail): List<MobileFollowUpRow> =
        detail.pendingUserInputs
            .asSequence()
            .filter { it.status == "pending" }
            .sortedBy { it.sequence }
            .map { MobileFollowUpRow(id = it.id, content = it.content, kind = it.kind) }
            .toList()

    fun conversationFromMessages(messages: List<PersistedMessage>): List<MobileConversationLine> =
        messages.sortedBy { it.createdAt }.mapNotNull(::toConversationLine)

    fun mergeMessagePages(
        existing: List<PersistedMessage>,
        olderPage: List<PersistedMessage>,
    ): List<PersistedMessage> {
        val byId = linkedMapOf<String, PersistedMessage>()
        for (message in olderPage + existing) {
            byId[message.id] = message
        }
        return byId.values.sortedBy { it.createdAt }
    }

    private fun toConversationLine(message: PersistedMessage): MobileConversationLine? =
        when (message.role) {
            "user" ->
                MobileConversationLine(
                    kind = "user",
                    content = message.content,
                    attachments = message.attachments.orEmpty(),
                )
            "assistant" -> assistantLineFromPersisted(message)
            else -> null
        }

    internal fun assistantLineFromPersisted(message: PersistedMessage): MobileConversationLine {
        val blocks = ConversationBlocks.blocksFromMetadata(message.metadata)
        return if (blocks.isNotEmpty()) {
            val presentation = AssistantPresentation.presentAssistantBlocks(blocks)
            val deliveryStatus = message.deliveryStatus ?: "completed"
            MobileConversationLine(
                kind = "assistant",
                content = presentation.pendingText + presentation.finalText,
                deliveryStatus = deliveryStatus,
                pendingText = presentation.pendingText.ifBlank { null },
                finalText = presentation.finalText.ifBlank { null },
                pending = deliveryStatus == "streaming",
                reasoning =
                    presentation.process
                        .filter { it.kind == "reasoning" }
                        .joinToString("") { it.content }
                        .ifBlank { message.reasoning },
                process = presentation.process,
            )
        } else {
            MobileConversationLine(
                kind = "assistant",
                content = message.content,
                deliveryStatus = message.deliveryStatus ?: "completed",
                finalText = message.content.ifBlank { null },
                reasoning = message.reasoning,
                process = processBlocks(message.metadata),
            )
        }
    }

    internal fun processBlocks(metadata: JsonObject): List<MobileProcessBlock> =
        (metadata["blocks"] as? JsonArray)?.mapNotNull { element -> (element as? JsonObject)?.let(::toProcessBlock) }.orEmpty()

    internal fun processBlocks(blocksValue: List<JsonElement>): List<MobileProcessBlock> =
        blocksValue.mapNotNull { element: JsonElement -> (element as? JsonObject)?.let { toProcessBlock(it) } }

    private fun toProcessBlock(block: JsonObject): MobileProcessBlock? {
        val kind = block["type"]?.jsonPrimitive?.content ?: return null
        return when (kind) {
            "reasoning" -> MobileProcessBlock(
                kind = "reasoning",
                id = block["id"]?.jsonPrimitive?.content.orEmpty(),
                content = block["content"]?.jsonPrimitive?.content.orEmpty(),
                durationMs = block["durationMs"]?.jsonPrimitive?.longOrNull,
                streaming = block["completedAt"] == null,
                roundSequence = block["roundSequence"]?.jsonPrimitive?.content?.toIntOrNull(),
            )
            "tool_activity" -> MobileProcessBlock(
                kind = "tool",
                id = block["id"]?.jsonPrimitive?.content.orEmpty(),
                name = block["toolName"]?.jsonPrimitive?.content
                    ?: block["name"]?.jsonPrimitive?.content.orEmpty(),
                summary = block["summary"]?.jsonPrimitive?.content.orEmpty(),
                status = block["status"]?.jsonPrimitive?.content.orEmpty(),
                duration = block["elapsed"]?.jsonPrimitive?.content
                    ?: block["duration"]?.jsonPrimitive?.content,
            )
            "text" -> if (block["phase"]?.jsonPrimitive?.content == "process") {
                MobileProcessBlock(
                    kind = "text",
                    id = block["id"]?.jsonPrimitive?.content.orEmpty(),
                    content = block["content"]?.jsonPrimitive?.content.orEmpty(),
                )
            } else {
                null
            }
            else -> null
        }
    }

    private fun formatUpdatedAt(iso: String): String {
        if (iso.length >= 10) {
            return iso.substring(0, 10)
        }
        return iso
    }
}
