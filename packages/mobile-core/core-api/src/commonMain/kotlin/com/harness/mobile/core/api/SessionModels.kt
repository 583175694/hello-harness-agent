package com.harness.mobile.core.api

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonObject

@Serializable
data class SessionSummary(
    val id: String,
    val title: String,
    val status: String = "active",
    val isPinned: Boolean = false,
    val createdAt: String,
    val updatedAt: String,
)

@Serializable
data class PersistedMessage(
    val id: String,
    val sessionId: String,
    val role: String,
    val kind: String,
    val content: String,
    val reasoning: String? = null,
    val metadata: JsonObject = JsonObject(emptyMap()),
    val runId: String? = null,
    val deliveryStatus: String? = null,
    val createdAt: String,
    val attachments: List<FileRef>? = null,
)

@Serializable
data class SessionPagination(
    val limit: Int,
    val hasMore: Boolean,
    val nextBefore: String? = null,
)

@Serializable
data class SessionActiveRun(
    val runId: String,
    val assistantMessageId: String,
    val status: String,
    val lastEventSequence: Int = 0,
)

@Serializable
data class PendingUserInputView(
    val id: String,
    val kind: String,
    val status: String,
    val content: String,
    val sequence: Int,
)

@Serializable
data class SessionDetail(
    val id: String,
    val title: String,
    val status: String = "active",
    val isPinned: Boolean = false,
    val createdAt: String,
    val updatedAt: String,
    val messages: List<PersistedMessage> = emptyList(),
    val pagination: SessionPagination? = null,
    val activeRun: SessionActiveRun? = null,
    val pendingUserInputs: List<PendingUserInputView> = emptyList(),
    val artifactSeries: List<ArtifactSeriesRef> = emptyList(),
)

@Serializable
data class SessionListPagination(
    val limit: Int,
    val hasMore: Boolean,
    val nextBefore: String? = null,
)

@Serializable
data class ListSessionsResponse(
    val sessions: List<SessionSummary>,
    val pagination: SessionListPagination? = null,
)

@Serializable
data class SessionDetailResponse(
    val session: SessionDetail,
)

@Serializable
data class CreateSessionResponse(
    val session: SessionSummary,
)

@Serializable
data class UpdateSessionResponse(
    val session: SessionSummary,
)

@Serializable
data class DeleteSessionResponse(
    val deletedSessionId: String,
)

@Serializable
data class UpdateSessionRequest(
    val title: String? = null,
    val isPinned: Boolean? = null,
)

/** Engine → Port 投影（与 mobile-contract ActiveSessionState 字段对齐的子集）。 */
data class MobileSessionDrawerRow(
    val id: String,
    val title: String,
    val timeLabel: String,
    val active: Boolean = false,
    val pinned: Boolean = false,
    val running: Boolean = false,
)

data class MobileConversationLine(
    val id: String = "",
    val kind: String,
    val content: String,
    val attachments: List<FileRef> = emptyList(),
    val deliveryStatus: String? = null,
    val pendingText: String? = null,
    val finalText: String? = null,
    val pending: Boolean = false,
    val reasoning: String? = null,
    val reasoningStreaming: Boolean = false,
    val process: List<MobileProcessBlock> = emptyList(),
    val artifacts: List<ArtifactRef> = emptyList(),
)

data class MobileProcessBlock(
    val kind: String,
    val id: String = "",
    val name: String = "",
    val summary: String = "",
    val status: String = "",
    val duration: String? = null,
    val content: String = "",
    val durationMs: Long? = null,
    val streaming: Boolean = false,
    val roundSequence: Int? = null,
)

data class MobileFollowUpRow(
    val id: String,
    val content: String,
    /** `follow_up` | `steer`（与 PendingUserInputView.kind 一致） */
    val kind: String = "follow_up",
)

data class MobileActiveSessionSnapshot(
    val sessionId: String?,
    val title: String,
    val isLanding: Boolean,
    val drawerSessions: List<MobileSessionDrawerRow>,
    val conversation: List<MobileConversationLine>,
    val canLoadOlderSessionSummaries: Boolean = false,
    val loadingOlderSessionSummaries: Boolean = false,
    val followUps: List<MobileFollowUpRow> = emptyList(),
    val sessionDetailLoading: Boolean = false,
    val composerSubmitting: Boolean = false,
    val workbenchRunId: String? = null,
    val workbench: MobileWorkbenchSnapshot? = null,
    val canLoadOlderMessages: Boolean = false,
    val loadingOlderMessages: Boolean = false,
    val composerClarification: MobileComposerClarification? = null,
    val composerToolApproval: MobileComposerToolApproval? = null,
    /** M-CMP-13：「基于此版本修改」预填 Composer（UI 消费后应调 clearComposerRevisionSeed）。 */
    val composerRevisionSeed: String? = null,
    /** Workbench 本地态（45 §4.7 / R11）：不上传服务端。 */
    val workbenchOpen: Boolean = false,
    val followMode: String = "auto",
    val workbenchFocusTarget: MobileWorkbenchFocusTarget? = null,
    val workbenchFocusHint: String? = null,
    val workbenchFocusedToolCallId: String? = null,
    val composerPlan: MobilePlanSnapshot? = null,
    val showPlanOverlay: Boolean = false,
)
