package com.harness.agent.port

import com.harness.agent.model.ActiveSessionState
import com.harness.agent.model.ArtifactItem
import com.harness.agent.model.ChromeState
import com.harness.agent.model.ConversationItem
import com.harness.agent.model.SessionDrawerItem
import com.harness.agent.model.SessionDrawerState
import com.harness.mobile.core.api.ConnectionState
import com.harness.mobile.core.api.MobileActiveSessionSnapshot
import com.harness.agent.model.FollowUpFixture
import com.harness.mobile.core.api.FileRef
import com.harness.mobile.core.api.MobileConversationLine
import com.harness.mobile.core.api.MobilePlanSnapshot
import com.harness.agent.model.UserAttachmentItem

object CoreSessionMapper {
    fun merge(
        snapshot: MobileActiveSessionSnapshot?,
        connection: ConnectionState,
    ): ActiveSessionState {
        val followUps =
            snapshot?.followUps.orEmpty().map { row ->
                FollowUpFixture(id = row.id, content = row.content)
            }
        val runtimeSteer =
            (
                snapshot?.drawerSessions?.any { it.active && it.running } == true ||
                    snapshot?.conversation?.lastOrNull()?.let {
                        it.kind == "assistant" && (it.pending || it.deliveryStatus == "streaming")
                    } == true
            ) &&
                snapshot.composerClarification == null &&
                snapshot.composerToolApproval == null
        val clarification = snapshot?.composerClarification
        val toolApproval = snapshot?.composerToolApproval
        val composerMode =
            when {
                clarification != null -> "clarification"
                toolApproval != null -> "hitl"
                else -> "default"
            }
        val base =
            ActiveSessionState(
                scenarioId = snapshot?.sessionId ?: "core-landing",
                title = snapshot?.title ?: "新对话",
                conversation = snapshot?.conversation.orEmpty().mapNotNull(::toConversationItem),
                composer =
                    com.harness.agent.model.ComposerState(
                        mode = composerMode,
                        followUps = followUps,
                        composerTextMode = if (runtimeSteer) "steer" else "new-run",
                        submitting = runtimeSteer || snapshot?.composerSubmitting == true,
                        clarification =
                            clarification?.let {
                                com.harness.agent.model.ClarificationFixture(
                                    question = it.question,
                                    options = it.options,
                                    allowFreeText = it.allowFreeText,
                                )
                            },
                        toolApproval =
                            toolApproval?.let {
                                com.harness.agent.model.ToolApprovalFixture(
                                    title = it.title,
                                    items =
                                        it.items.map { item ->
                                            com.harness.agent.model.ToolApprovalItemFixture(
                                                itemId = item.itemId,
                                                toolName = item.toolName,
                                                command = item.command,
                                            )
                                        },
                                    sandboxNote = it.sandboxNote,
                                )
                            },
                        revisionDraftSeed = snapshot?.composerRevisionSeed,
                        showPlan = snapshot?.showPlanOverlay == true,
                        plan = snapshot?.composerPlan?.toPlanFixture(),
                    ),
                chrome = mapChrome(connection),
                sessionDrawer =
                    SessionDrawerState(
                        sessions =
                            snapshot?.drawerSessions.orEmpty().map { row ->
                                SessionDrawerItem(
                                    id = row.id,
                                    title = row.title,
                                    time = row.timeLabel,
                                    active = row.active,
                                    pinned = row.pinned,
                                    running = row.running,
                                )
                            },
                    ),
                workbench = WorkbenchSnapshotMapper.toUi(snapshot?.workbench),
                canLoadOlderMessages = snapshot?.canLoadOlderMessages == true,
                loadingOlderMessages = snapshot?.loadingOlderMessages == true,
                canLoadOlderSessionSummaries = snapshot?.canLoadOlderSessionSummaries == true,
                loadingOlderSessionSummaries = snapshot?.loadingOlderSessionSummaries == true,
                uiHints =
                    com.harness.agent.model.UiHints(
                        workbenchOpen = snapshot?.workbenchOpen == true,
                        workbenchFocusedToolCallId = snapshot?.workbenchFocusedToolCallId,
                        workbenchFocusHint = snapshot?.workbenchFocusHint,
                    ),
            )
        return if (snapshot?.isLanding == true && snapshot.conversation.isEmpty()) {
            base.copy(
                conversation = emptyList(),
            )
        } else {
            base
        }
    }

    private fun toConversationItem(line: MobileConversationLine): ConversationItem? =
        when (line.kind) {
            "user" ->
                ConversationItem.User(
                    id = line.id.ifBlank { "user-${line.hashCode()}" },
                    content = line.content,
                    attachments = line.attachments.map(::toUserAttachment),
                )
            "assistant" -> {
                val status = line.deliveryStatus ?: "completed"
                val streaming = status == "streaming"
                val runInProgress = line.pending || streaming
                val pendingBody = line.pendingText?.takeIf { it.isNotBlank() }
                val finalBody = line.finalText?.takeIf { it.isNotBlank() }
                ConversationItem.Assistant(
                    id = line.id.ifBlank { "assistant-${line.hashCode()}" },
                    deliveryStatus = status,
                    pending = line.pending,
                    pendingText = if (runInProgress) pendingBody else null,
                    finalText = if (runInProgress) finalBody else null,
                    tailTarget = null,
                    markdownContent = if (runInProgress) null else (finalBody ?: line.content.ifBlank { null }),
                    process = if (line.process.isNotEmpty()) line.process.mapNotNull { block ->
                        when (block.kind) {
                            "reasoning" -> com.harness.agent.model.ProcessBlock.Reasoning(
                                id = block.id,
                                content = block.content,
                                durationMs = block.durationMs,
                                streaming = block.streaming,
                            )
                            "tool" -> com.harness.agent.model.ProcessBlock.ToolActivity(
                                id = block.id,
                                name = block.name,
                                summary = block.summary,
                                status = block.status,
                                duration = block.duration,
                            )
                            "text" -> com.harness.agent.model.ProcessBlock.Text(block.id, block.content)
                            else -> null
                        }
                    } else line.reasoning?.takeIf { it.isNotBlank() }?.let {
                        listOf(
                            com.harness.agent.model.ProcessBlock.Reasoning(
                                id = "${line.id}:reasoning",
                                content = it,
                                streaming = streaming && line.reasoningStreaming,
                            ),
                        )
                    }.orEmpty(),
                    artifacts = line.artifacts.map(::toArtifactItem),
                )
            }
            else -> null
        }

    private fun toArtifactItem(ref: com.harness.mobile.core.api.ArtifactRef): ArtifactItem =
        ArtifactItem(
            artifactId = ref.artifactId,
            fileId = ref.fileId,
            fileName = ref.fileName,
            mediaType = ref.mediaType,
            fileKind = ref.fileKind,
            size = ref.size,
            status = ref.status,
            seriesId = ref.seriesId,
            versionNumber = ref.versionNumber,
            isCurrent = ref.isCurrent,
        )

    private fun toUserAttachment(ref: FileRef): UserAttachmentItem =
        UserAttachmentItem(
            fileId = ref.fileId,
            fileName = ref.fileName,
            mediaType = ref.mediaType,
            size = ref.size,
            previewUrl = ref.previewUrl,
            fileKind = ref.fileKind,
        )

    private fun mapChrome(connection: ConnectionState): ChromeState =
        when (connection) {
            ConnectionState.Idle ->
                ChromeState(connectionState = "idle", serviceState = "unknown")
            ConnectionState.Connecting ->
                ChromeState(connectionState = "connecting", serviceState = "checking")
            ConnectionState.Live ->
                ChromeState(connectionState = "live", serviceState = "ready")
            ConnectionState.Reconnecting ->
                ChromeState(connectionState = "reconnecting", serviceState = "ready")
            ConnectionState.Offline ->
                ChromeState(
                    connectionState = "offline",
                    serviceState = "unavailable",
                    runSummary = "服务不可用",
                )
            ConnectionState.ServiceUnavailable ->
                ChromeState(
                    connectionState = "offline",
                    serviceState = "unavailable",
                    runSummary = "服务不可用",
                )
        }

    private fun MobilePlanSnapshot.toPlanFixture(): com.harness.agent.model.PlanFixture =
        com.harness.agent.model.PlanFixture(
            explanation = explanation,
            steps =
                steps.map { step ->
                    com.harness.agent.model.PlanStepFixture(
                        step = step.step,
                        status = step.status,
                    )
                },
        )
}
