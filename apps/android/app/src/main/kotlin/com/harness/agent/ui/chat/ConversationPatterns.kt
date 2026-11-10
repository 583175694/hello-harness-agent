package com.harness.agent.ui.chat

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.layout.wrapContentWidth
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.harness.agent.media.HarnessAuthedAsyncImage
import com.harness.agent.coreui.markdown.ChatMarkdown
import com.harness.agent.coreui.markdown.StreamingChatMarkdown
import com.harness.agent.coreui.primitives.AppText
import com.harness.agent.coreui.primitives.AppTextStyle
import com.harness.agent.coreui.tokens.HarnessLayout
import com.harness.agent.coreui.tokens.LocalHarnessColors
import com.harness.agent.model.ArtifactItem
import com.harness.agent.model.ConversationItem
import com.harness.agent.model.toReaderTarget
import com.harness.agent.model.UserAttachmentItem

@Composable
fun ConversationTurnRow(
    item: ConversationItem,
    modifier: Modifier = Modifier,
    onOpenWorkbenchStep: ((toolCallId: String) -> Unit)? = null,
    onOpenArtifact: ((ArtifactItem) -> Unit)? = null,
    previewReduceMotion: Boolean = false,
) {
    when (item) {
        is ConversationItem.User ->
            UserMessageBubble(
                text = item.content,
                attachments = item.attachments,
                modifier = modifier,
            )
        is ConversationItem.Assistant ->
            AssistantMessageBubble(
                item = item,
                modifier = modifier,
                onOpenWorkbenchStep = onOpenWorkbenchStep,
                onOpenArtifact = onOpenArtifact,
                previewReduceMotion = previewReduceMotion,
            )
    }
}

@Composable
fun UserMessageBubble(
    text: String,
    attachments: List<UserAttachmentItem> = emptyList(),
    modifier: Modifier = Modifier,
) {
    val colors = LocalHarnessColors.current
    BoxWithConstraints(
        modifier =
            modifier
                .fillMaxWidth()
                .padding(vertical = HarnessLayout.chatTurnVerticalPadding),
    ) {
        val maxBubbleWidth = maxWidth * 0.82f
        Column(
            modifier =
                Modifier
                    .align(Alignment.CenterEnd)
                    .widthIn(max = maxBubbleWidth)
                    .wrapContentWidth(Alignment.End),
            horizontalAlignment = Alignment.End,
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            if (attachments.isNotEmpty()) {
                UserAttachmentStack(attachments = attachments)
            }
            if (text.isNotBlank()) {
                Box(
                    modifier =
                        Modifier
                            .wrapContentWidth(Alignment.End)
                            .background(colors.userBubble, RoundedCornerShape(HarnessLayout.bubbleRadius))
                            .padding(
                                horizontal = HarnessLayout.chatBubblePaddingHorizontal,
                                vertical = HarnessLayout.chatBubblePaddingVertical,
                            ),
                ) {
                    ChatMarkdown(
                        markdown = text,
                        compact = true,
                        userBubble = true,
                        contentMaxWidth = maxBubbleWidth,
                        modifier = Modifier.wrapContentWidth(Alignment.Start),
                    )
                }
            }
        }
    }
}

@Composable
private fun UserAttachmentStack(attachments: List<UserAttachmentItem>) {
    val colors = LocalHarnessColors.current
    val images = attachments.filter { it.isImage() }
    val files = attachments.filterNot { it.isImage() }
    Column(horizontalAlignment = Alignment.End, verticalArrangement = Arrangement.spacedBy(8.dp)) {
        if (images.isNotEmpty()) {
            Row(
                modifier = Modifier.horizontalScroll(rememberScrollState()),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                images.forEach { attachment ->
                    Box(
                        modifier =
                            Modifier
                                .height(112.dp)
                                .width(112.dp)
                                .background(colors.subtle, RoundedCornerShape(12.dp))
                                .border(1.dp, colors.composerBorder, RoundedCornerShape(12.dp)),
                        contentAlignment = Alignment.Center,
                    ) {
                        if (!attachment.previewUrl.isNullOrBlank() || attachment.fileId.isNotBlank()) {
                            HarnessAuthedAsyncImage(
                                fileId = attachment.fileId,
                                serverPreviewUrl = attachment.previewUrl,
                                localPreviewUri = null,
                                contentDescription = attachment.fileName,
                                modifier =
                                    Modifier
                                        .fillMaxSize()
                                        .clip(RoundedCornerShape(12.dp)),
                                contentScale = ContentScale.Crop,
                            )
                        } else {
                            androidx.compose.material3.Text(
                                text = "IMG",
                                color = colors.muted,
                                fontSize = 12.sp,
                            )
                        }
                    }
                }
            }
        }
        files.forEach { attachment ->
            UserAttachmentFileChip(fileName = attachment.fileName)
        }
    }
}

@Composable
private fun UserAttachmentFileChip(fileName: String) {
    val colors = LocalHarnessColors.current
    Row(
        modifier =
            Modifier
                .background(colors.subtle, RoundedCornerShape(HarnessLayout.controlRadius))
                .border(1.dp, colors.composerBorder, RoundedCornerShape(HarnessLayout.controlRadius))
                .padding(horizontal = 12.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        androidx.compose.material3.Text(
            text = fileName,
            color = colors.primary,
            fontSize = 13.sp,
            maxLines = 1,
        )
    }
}

private fun UserAttachmentItem.isImage(): Boolean =
    fileKind == "image" || mediaType.startsWith("image/", ignoreCase = true)

@Composable
fun AssistantMessageBubble(
    item: ConversationItem.Assistant,
    modifier: Modifier = Modifier,
    onOpenWorkbenchStep: ((toolCallId: String) -> Unit)? = null,
    onOpenArtifact: ((ArtifactItem) -> Unit)? = null,
    previewReduceMotion: Boolean = false,
) {
    val hasProcess = item.process.isNotEmpty()
    val followsProcess = hasProcess
    Column(
        modifier =
            modifier
                .fillMaxWidth()
                .padding(vertical = HarnessLayout.chatTurnVerticalPadding),
        verticalArrangement = Arrangement.spacedBy(HarnessLayout.chatAssistantSectionGap),
    ) {
        val runInProgress = item.pending || item.deliveryStatus == "streaming"
        if (hasProcess || runInProgress) {
            AssistantProcessTimeline(
                blocks = item.process,
                running = runInProgress,
                finalOutputVisible = item.assistantFinalOutputVisible(),
                onOpenWorkbench = onOpenWorkbenchStep,
                previewReduceMotion = previewReduceMotion,
            )
        }
        when {
            runInProgress -> {
                val hasVisibleProcess =
                    item.process.any {
                        when (it) {
                            is com.harness.agent.model.ProcessBlock.Reasoning -> it.content.isNotBlank()
                            is com.harness.agent.model.ProcessBlock.ToolActivity -> true
                            is com.harness.agent.model.ProcessBlock.Text -> it.content.isNotBlank()
                        }
                    }
                val pending = item.pendingText?.takeIf { it.isNotBlank() }
                val final = item.finalText?.takeIf { it.isNotBlank() }
                val hasVisibleOutput = pending != null || final != null
                if (hasVisibleOutput) {
                    AssistantDeliveryColumn(
                        extraTop = if (hasProcess) HarnessLayout.chatAssistantDeliveryExtraTop else 0.dp,
                    ) {
                        pending?.let { body ->
                            StreamingChatMarkdown(
                                markdown = body,
                                modifier = Modifier.fillMaxWidth(),
                                followsProcessTimeline = followsProcess && final == null,
                            )
                        }
                        final?.let { body ->
                            StreamingChatMarkdown(
                                markdown = body,
                                modifier = Modifier.fillMaxWidth(),
                                followsProcessTimeline = followsProcess && pending == null,
                            )
                        }
                    }
                }
                val timelineShowsThinkingPlaceholder =
                    runInProgress && item.process.isEmpty()
                if (!hasVisibleProcess && !hasVisibleOutput && !timelineShowsThinkingPlaceholder) {
                    AppText(text = "正在思考", style = AppTextStyle.Body)
                }
            }
            else ->
                AssistantDeliveryColumn(
                    extraTop = if (hasProcess) HarnessLayout.chatAssistantDeliveryExtraTop else 0.dp,
                ) {
                    ChatMarkdown(
                        markdown = item.assistantBodyMarkdown(),
                        modifier = Modifier.fillMaxWidth(),
                        followsProcessTimeline = followsProcess,
                    )
                }
        }
        if (item.artifacts.isNotEmpty()) {
            AssistantArtifactCards(item.artifacts, onOpenArtifact)
        }
    }
}

@Composable
private fun AssistantArtifactCards(
    artifacts: List<ArtifactItem>,
    onOpenArtifact: ((ArtifactItem) -> Unit)?,
) {
    val colors = LocalHarnessColors.current
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        artifacts.forEach { artifact ->
            Row(
                modifier =
                    Modifier
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(HarnessLayout.panelRadius))
                        .background(colors.surface, RoundedCornerShape(HarnessLayout.panelRadius))
                        .border(1.dp, colors.composerBorder, RoundedCornerShape(HarnessLayout.panelRadius))
                        .clickable(enabled = onOpenArtifact != null) { onOpenArtifact?.invoke(artifact) }
                        .padding(horizontal = 12.dp, vertical = 10.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                AppText(
                    text = artifact.fileKind.uppercase().take(4).ifBlank { "FILE" },
                    style = AppTextStyle.Link,
                )
                Column(modifier = Modifier.weight(1f)) {
                    AppText(
                        text = artifact.fileName,
                        style = AppTextStyle.Body,
                    )
                    AppText(
                        text = listOfNotNull(
                            artifact.fileKind,
                            artifact.versionNumber?.let { "v$it" },
                            artifact.status,
                            if (artifact.isCurrent == true) "当前版本" else null,
                        ).joinToString(" · "),
                        style = AppTextStyle.Muted,
                    )
                }
                AppText("打开", style = AppTextStyle.Link)
            }
        }
    }
}

@Composable
private fun AssistantDeliveryColumn(
    extraTop: Dp,
    content: @Composable () -> Unit,
) {
    Column(
        modifier =
            Modifier
                .fillMaxWidth()
                .then(if (extraTop > 0.dp) Modifier.padding(top = extraTop) else Modifier),
        verticalArrangement = Arrangement.spacedBy(HarnessLayout.chatAssistantSectionGap),
    ) {
        content()
    }
}

internal fun ConversationItem.Assistant.assistantBodyMarkdown(): String =
    markdownContent?.takeIf { it.isNotBlank() } ?: summary.orEmpty()

internal fun ConversationItem.Assistant.assistantFinalOutputVisible(): Boolean =
    pendingText?.isNotBlank() == true ||
        finalText?.isNotBlank() == true ||
        assistantBodyMarkdown().isNotBlank()
