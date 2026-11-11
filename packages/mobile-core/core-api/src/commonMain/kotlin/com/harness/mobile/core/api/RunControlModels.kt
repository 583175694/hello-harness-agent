package com.harness.mobile.core.api

import kotlinx.serialization.EncodeDefault
import kotlinx.serialization.Serializable

@Serializable
data class ToolApprovalDecisionDto(
    val itemId: String,
    val toolCallId: String,
    val argumentsHash: String,
    val decision: String,
)

@Serializable
data class RunControlRespondCommand(
    @EncodeDefault(EncodeDefault.Mode.ALWAYS) val type: String = "respond",
    val interruptId: String,
    val payload: RunControlRespondPayload,
)

@Serializable
data class RunControlRespondPayload(
    val answer: String,
)

@Serializable
data class RunControlApproveCommand(
    @EncodeDefault(EncodeDefault.Mode.ALWAYS) val type: String = "approve",
    val interruptId: String,
    val decisions: List<ToolApprovalDecisionDto>,
)

@Serializable
data class RunControlRejectCommand(
    @EncodeDefault(EncodeDefault.Mode.ALWAYS) val type: String = "reject",
    val interruptId: String,
    val decisions: List<ToolApprovalDecisionDto>,
)

@Serializable
data class RunControlResponse(
    val runId: String,
    val snapshot: RunSnapshot,
)

@Serializable
data class MobileComposerClarification(
    val interruptId: String,
    val question: String,
    val options: List<String> = emptyList(),
    val allowFreeText: Boolean = true,
)

@Serializable
data class MobileComposerToolApprovalItem(
    val itemId: String,
    val toolName: String,
    val command: String,
    val toolCallId: String,
    val argumentsHash: String,
)

@Serializable
data class MobileComposerToolApproval(
    val interruptId: String,
    val title: String = "需要批准工具调用",
    val items: List<MobileComposerToolApprovalItem>,
    val sandboxNote: String? = null,
)
