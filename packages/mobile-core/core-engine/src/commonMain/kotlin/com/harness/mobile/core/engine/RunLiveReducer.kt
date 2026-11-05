package com.harness.mobile.core.engine

import com.harness.mobile.core.api.MobileComposerClarification
import com.harness.mobile.core.api.MobileComposerToolApproval
import com.harness.mobile.core.api.MobileConversationLine
import com.harness.mobile.core.api.RunSnapshot
import com.harness.mobile.core.api.RunStreamEvent
import com.harness.mobile.core.api.SessionActiveRun
import com.harness.mobile.core.api.SessionDetail
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put

data class LiveRunState(
    val sessionId: String,
    val runId: String,
    val userMessageId: String,
    val assistantMessageId: String,
    val userText: String,
    val userAttachments: List<com.harness.mobile.core.api.FileRef> = emptyList(),
    val blocks: List<JsonObject> = emptyList(),
    val deliveryStatus: String = "streaming",
    val cursor: Int = 0,
    val composerClarification: MobileComposerClarification? = null,
    val composerToolApproval: MobileComposerToolApproval? = null,
    val latestToolCallId: String? = null,
)

class RunLiveReducer {
    /** R8：进入 Session 时服务端仍有 activeRun。 */
    fun fromActiveRun(
        detail: SessionDetail,
        activeRun: SessionActiveRun,
    ): LiveRunState {
        val assistantMsg = detail.messages.lastOrNull { it.id == activeRun.assistantMessageId }
        val userMsg =
            detail.messages.lastOrNull { it.role == "user" && it.runId == activeRun.runId }
                ?: detail.messages.lastOrNull { it.role == "user" }
        val blocks =
            assistantMsg?.metadata?.let(ConversationBlocks::blocksFromMetadata).orEmpty()
                .ifEmpty {
                    assistantMsg?.content?.takeIf { it.isNotBlank() }?.let { content ->
                        listOf(
                            buildJsonObject {
                                put("id", "${activeRun.assistantMessageId}-content")
                                put("type", AssistantBlockTypes.TEXT)
                                put("content", content)
                                put("phase", "final")
                            },
                        )
                    }.orEmpty()
                }
        return LiveRunState(
            sessionId = detail.id,
            runId = activeRun.runId,
            userMessageId = userMsg?.id.orEmpty(),
            assistantMessageId = activeRun.assistantMessageId,
            userText = userMsg?.content.orEmpty(),
            userAttachments = userMsg?.attachments.orEmpty(),
            blocks = blocks,
            deliveryStatus = snapshotDeliveryStatus(activeRun.status.ifBlank { "streaming" }),
            cursor = activeRun.lastEventSequence,
        )
    }

    fun fromCreateRun(
        sessionId: String,
        userText: String,
        response: com.harness.mobile.core.api.CreateRunResponse,
        userAttachments: List<com.harness.mobile.core.api.FileRef> = emptyList(),
    ): LiveRunState =
        LiveRunState(
            sessionId = sessionId,
            runId = response.runId,
            userMessageId = response.userMessageId,
            assistantMessageId = response.assistantMessageId,
            userText = userText,
            userAttachments = userAttachments,
        )

    fun applySnapshot(
        state: LiveRunState,
        snapshot: RunSnapshot,
    ): LiveRunState {
        val snapshotBlocks = ConversationBlocks.blocksFromJsonElements(snapshot.blocks)
        var nextBlocks = ApplyRunSnapshotBlocks.preferRicherBlocks(state.blocks, snapshotBlocks)
        if (nextBlocks.isEmpty() && snapshot.assistantContent.isNotBlank()) {
            nextBlocks =
                listOf(
                    buildJsonObject {
                        put("id", "${state.assistantMessageId}-content")
                        put("type", AssistantBlockTypes.TEXT)
                        put("content", snapshot.assistantContent)
                        put("phase", "final")
                    },
                )
        }
        var next =
            state.copy(
                blocks = nextBlocks,
                cursor = maxOf(state.cursor, snapshot.lastEventSequence),
                deliveryStatus =
                    if (isTerminal(snapshot.status)) {
                        snapshot.status
                    } else {
                        snapshotDeliveryStatus(snapshot.status)
                    },
            )
        if (snapshot.activeInterrupt != null) {
            val pending =
                when (val element = snapshot.activeInterrupt) {
                    is JsonObject -> InterruptPayloadParser.fromInterruptObject(element)
                    else -> null
                }
            next =
                next.copy(
                    composerClarification = pending?.clarification,
                    composerToolApproval = pending?.toolApproval,
                )
        }
        return next
    }

    fun applyEvent(
        state: LiveRunState,
        event: RunStreamEvent,
    ): ApplyEventResult {
        if (event.seq <= state.cursor) {
            return ApplyEventResult(state, duplicate = true)
        }
        if (event.seq > state.cursor + 1 && (state.cursor > 0 || event.seq > 1)) {
            return ApplyEventResult(state, gap = true)
        }
        var next = state.copy(cursor = event.seq)
        val payloadObject = event.payload?.jsonObject
        when (event.type) {
            "message.delta",
            "message.phase.completed",
            "message.discarded",
            "reasoning.delta",
            "model.round.completed",
            "tool.started",
            "tool.completed",
            "tool.failed",
            "tool.cancelled",
            -> {
                next =
                    next.copy(
                        blocks =
                            ApplyRunEventConversation.apply(
                                next.blocks,
                                event.type,
                                payloadObject,
                            ),
                    )
                if (event.type == "tool.started") {
                    val toolCallId = payloadObject?.get("toolCallId")?.jsonPrimitive?.content
                    if (!toolCallId.isNullOrBlank()) {
                        next = next.copy(latestToolCallId = toolCallId)
                    }
                }
            }
            "run.completed" -> next = next.copy(deliveryStatus = "completed")
            "run.failed" -> next = next.copy(deliveryStatus = "failed")
            "run.cancelled" -> next = next.copy(deliveryStatus = "cancelled")
            "run.snapshot" -> {
                val snapshot =
                    event.payload?.let { payload ->
                        runCatching {
                            Json { ignoreUnknownKeys = true }
                                .decodeFromJsonElement(RunSnapshot.serializer(), payload)
                        }.getOrNull()
                    }
                if (snapshot != null) {
                    next = applySnapshot(next, snapshot).copy(cursor = maxOf(next.cursor, event.seq))
                } else {
                    val status = payloadObject?.get("status")?.jsonPrimitive?.content
                    if (status != null && isTerminal(status)) {
                        next = next.copy(deliveryStatus = status)
                    }
                }
            }
            "interrupt.created", "run.waiting_for_user" -> {
                InterruptPayloadParser.fromEventPayload(event.payload)?.let { pending ->
                    next =
                        next.copy(
                            composerClarification = pending.clarification,
                            composerToolApproval = pending.toolApproval,
                        )
                }
            }
            "interrupt.resolved", "interrupt.cancelled" -> {
                next =
                    next.copy(
                        composerClarification = null,
                        composerToolApproval = null,
                    )
            }
        }
        return ApplyEventResult(next)
    }

    fun toConversation(state: LiveRunState): List<MobileConversationLine> {
        val presentation = AssistantPresentation.presentAssistantBlocks(state.blocks)
        val inProgress = !isTerminal(state.deliveryStatus)
        val streaming = inProgress
        val reasoningFallback =
            presentation.process
                .filter { it.kind == "reasoning" }
                .joinToString("") { it.content }
                .ifBlank { null }
        val bodyText = presentation.pendingText + presentation.finalText
        return listOf(
            MobileConversationLine(
                id = state.userMessageId.ifBlank { "live:${state.runId}:user" },
                kind = "user",
                content = state.userText,
                attachments = state.userAttachments,
            ),
            MobileConversationLine(
                id = state.assistantMessageId.ifBlank { "live:${state.runId}:assistant" },
                kind = "assistant",
                content = bodyText,
                deliveryStatus = if (inProgress) "streaming" else state.deliveryStatus,
                pendingText = presentation.pendingText.ifBlank { null },
                finalText = presentation.finalText.ifBlank { null },
                pending = inProgress,
                reasoning = reasoningFallback,
                reasoningStreaming = streaming && presentation.process.any { it.kind == "reasoning" && it.streaming },
                process = presentation.process,
                artifacts = presentation.artifacts,
            ),
        )
    }

    private fun isTerminal(status: String): Boolean =
        status == "completed" || status == "failed" || status == "cancelled"

    /** Aligns with TS [snapshotDeliveryStatus]. */
    private fun snapshotDeliveryStatus(status: String): String =
        when (status) {
            "completed", "cancelled", "failed" -> status
            else -> "streaming"
        }

    data class ApplyEventResult(
        val state: LiveRunState,
        val duplicate: Boolean = false,
        val gap: Boolean = false,
    )
}
