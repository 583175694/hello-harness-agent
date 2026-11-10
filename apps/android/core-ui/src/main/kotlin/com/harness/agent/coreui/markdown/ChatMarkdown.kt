package com.harness.agent.coreui.markdown

import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.Dp

/** 对话气泡内 Markdown（用户 / 助手正文共用）。 */
@Composable
fun ChatMarkdown(
    markdown: String,
    modifier: Modifier = Modifier,
    compact: Boolean = false,
    followsProcessTimeline: Boolean = false,
    /** 思维链等场景：与流式 [androidx.compose.material3.Text] 脚注样式对齐（小号弱色），避免终态 Markwon 突然变大变深。 */
    timelineReasoningStyle: Boolean = false,
    /** 用户气泡等 compact 场景：限制 Markwon 量宽，避免 TextView 撑满一行。 */
    contentMaxWidth: Dp? = null,
    /** 用户发送气泡：更紧的行距（见 [com.harness.agent.coreui.tokens.HarnessLayout.chatMarkdownUserBubbleLeadingPx]）。 */
    userBubble: Boolean = false,
) {
    MarkwonChatMarkdown(
        markdown = markdown,
        modifier = modifier,
        compact = compact,
        followsProcessTimeline = followsProcessTimeline,
        timelineReasoningStyle = timelineReasoningStyle,
        contentMaxWidth = contentMaxWidth,
        userBubble = userBubble,
    )
}
