package com.harness.agent.ui.chat

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.layout.wrapContentWidth
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.harness.agent.coreui.markdown.ChatMarkdown
import com.harness.agent.coreui.primitives.AppText
import com.harness.agent.coreui.primitives.AppTextStyle
import com.harness.agent.coreui.tokens.HarnessLayout
import com.harness.agent.coreui.tokens.LocalHarnessColors
import com.harness.agent.model.ConversationItem

@Composable
fun ConversationTurnRow(
    item: ConversationItem,
    modifier: Modifier = Modifier,
    onOpenWorkbenchStep: ((toolCallId: String) -> Unit)? = null,
    previewReduceMotion: Boolean = false,
) {
    when (item) {
        is ConversationItem.User -> UserMessageBubble(text = item.content, modifier = modifier)
        is ConversationItem.Assistant ->
            AssistantMessageBubble(
                item = item,
                modifier = modifier,
                onOpenWorkbenchStep = onOpenWorkbenchStep,
                previewReduceMotion = previewReduceMotion,
            )
    }
}

@Composable
fun UserMessageBubble(
    text: String,
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
        Box(
            modifier =
                Modifier
                    .align(Alignment.CenterEnd)
                    .widthIn(max = maxBubbleWidth)
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
                modifier = Modifier.wrapContentWidth(Alignment.Start),
            )
        }
    }
}

@Composable
fun AssistantMessageBubble(
    item: ConversationItem.Assistant,
    modifier: Modifier = Modifier,
    onOpenWorkbenchStep: ((toolCallId: String) -> Unit)? = null,
    previewReduceMotion: Boolean = false,
) {
    Column(
        modifier =
            modifier
                .fillMaxWidth()
                .padding(vertical = HarnessLayout.chatTurnVerticalPadding),
    ) {
        AssistantProcessTimeline(
            blocks = item.process,
            running = item.deliveryStatus == "streaming",
            finalOutputVisible = item.assistantBodyMarkdown().isNotBlank(),
            onOpenWorkbench = onOpenWorkbenchStep,
            previewReduceMotion = previewReduceMotion,
        )
        when {
            item.deliveryStatus == "streaming" -> {
                val body = item.pendingText.orEmpty().ifEmpty { "▍" }
                AppText(text = body, style = AppTextStyle.Body)
            }
            else ->
                ChatMarkdown(
                    markdown = item.assistantBodyMarkdown(),
                    modifier = Modifier.fillMaxWidth(),
                )
        }
    }
}

internal fun ConversationItem.Assistant.assistantBodyMarkdown(): String =
    markdownContent?.takeIf { it.isNotBlank() } ?: summary.orEmpty()
