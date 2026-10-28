package com.harness.agent.ui.chat

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.harness.agent.coreui.markdown.MarkdownBody
import com.harness.agent.coreui.primitives.AppText
import com.harness.agent.coreui.primitives.AppTextStyle
import com.harness.agent.coreui.primitives.Spinner
import com.harness.agent.coreui.tokens.HarnessLayout
import com.harness.agent.coreui.tokens.LocalContentFontSizeSp
import com.harness.agent.coreui.tokens.LocalHarnessColors
import androidx.compose.material3.Text
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp
import com.harness.agent.model.ConversationItem

@Composable
fun ConversationTurnRow(
    item: ConversationItem,
    modifier: Modifier = Modifier,
    onOpenWorkbenchStep: ((toolCallId: String) -> Unit)? = null,
) {
    when (item) {
        is ConversationItem.User -> UserMessageBubble(text = item.content, modifier = modifier)
        is ConversationItem.Assistant ->
            AssistantMessageBubble(
                item = item,
                modifier = modifier,
                onOpenWorkbenchStep = onOpenWorkbenchStep,
            )
    }
}

@Composable
fun UserMessageBubble(
    text: String,
    modifier: Modifier = Modifier,
) {
    val colors = LocalHarnessColors.current
    Box(
        modifier =
            modifier
                .fillMaxWidth()
                .padding(vertical = 4.dp),
        contentAlignment = Alignment.CenterEnd,
    ) {
        Box(
            modifier =
                Modifier
                    .fillMaxWidth(0.82f)
                    .background(colors.userBubble, RoundedCornerShape(HarnessLayout.bubbleRadius))
                    .padding(horizontal = 16.dp, vertical = 10.dp),
        ) {
            val contentFont = LocalContentFontSizeSp.current.coerceIn(13, 20)
            Text(
                text = text,
                color = colors.primary,
                fontSize = (contentFont - 1).sp,
                lineHeight = 20.sp,
                fontWeight = FontWeight.Normal,
            )
        }
    }
}

@Composable
fun AssistantMessageBubble(
    item: ConversationItem.Assistant,
    modifier: Modifier = Modifier,
    onOpenWorkbenchStep: ((toolCallId: String) -> Unit)? = null,
) {
    Column(
        modifier =
            modifier
                .fillMaxWidth()
                .padding(vertical = 4.dp),
    ) {
        AssistantProcessTimeline(
            blocks = item.process,
            running = item.deliveryStatus == "streaming",
            finalOutputVisible = item.markdownContent != null || item.summary != null,
            onOpenWorkbench = onOpenWorkbenchStep,
        )
        when {
            item.deliveryStatus == "streaming" -> {
                val body = item.pendingText.orEmpty().ifEmpty { "▍" }
                AppText(text = body, style = AppTextStyle.Body)
                Spinner(modifier = Modifier.padding(top = 6.dp))
            }
            item.markdownContent != null ->
                MarkdownBody(markdown = item.markdownContent)
            else ->
                AppText(text = item.summary.orEmpty(), style = AppTextStyle.Body)
        }
    }
}
