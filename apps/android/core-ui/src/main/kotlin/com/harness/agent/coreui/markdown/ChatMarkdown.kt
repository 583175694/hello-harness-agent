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
    /** 用户气泡等 compact 场景：限制 Markwon 量宽，避免 TextView 撑满一行。 */
    contentMaxWidth: Dp? = null,
) {
    MarkwonChatMarkdown(
        markdown = markdown,
        modifier = modifier,
        compact = compact,
        followsProcessTimeline = followsProcessTimeline,
        contentMaxWidth = contentMaxWidth,
    )
}
