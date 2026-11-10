package com.harness.agent.coreui.markdown

import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import com.harness.mobile.core.api.StreamingMarkdown
import kotlinx.coroutines.delay

/** Run 中流式正文：预处理 + 节流后再走 [ChatMarkdown]。 */
@Composable
fun StreamingChatMarkdown(
    markdown: String,
    modifier: Modifier = Modifier,
    compact: Boolean = false,
    followsProcessTimeline: Boolean = false,
    timelineReasoningStyle: Boolean = false,
    debounceMs: Long = StreamingMarkdown.DEFAULT_DEBOUNCE_MS,
) {
    var displayed by remember { mutableStateOf("") }
    LaunchedEffect(markdown) {
        if (displayed.isEmpty() && markdown.isNotEmpty()) {
            displayed = StreamingMarkdown.prepareForParse(markdown)
        }
        delay(debounceMs)
        displayed = StreamingMarkdown.prepareForParse(markdown)
    }
    if (displayed.isNotBlank()) {
        ChatMarkdown(
            markdown = displayed,
            modifier = modifier,
            compact = compact,
            followsProcessTimeline = followsProcessTimeline,
            timelineReasoningStyle = timelineReasoningStyle,
        )
    }
}
