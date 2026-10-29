package com.harness.agent.coreui.markdown

import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier

/** 对话气泡内 Markdown（用户 / 助手正文共用）。 */
@Composable
fun ChatMarkdown(
    markdown: String,
    modifier: Modifier = Modifier,
    compact: Boolean = false,
) {
    MarkdownBody(markdown = markdown, modifier = modifier, compact = compact)
}
