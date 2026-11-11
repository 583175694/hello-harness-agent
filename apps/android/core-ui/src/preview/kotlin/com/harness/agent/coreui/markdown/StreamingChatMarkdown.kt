package com.harness.agent.coreui.markdown

import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import kotlinx.coroutines.delay

private const val PREVIEW_STREAM_DEBOUNCE_MS = 120L

/** Gate A Preview：节流后直接 Markwon，不依赖 mobile-core。 */
@Composable
fun StreamingChatMarkdown(
    markdown: String,
    modifier: Modifier = Modifier,
    compact: Boolean = false,
    followsProcessTimeline: Boolean = false,
    timelineReasoningStyle: Boolean = false,
    debounceMs: Long = PREVIEW_STREAM_DEBOUNCE_MS,
) {
    var displayed by remember { mutableStateOf("") }
    LaunchedEffect(markdown) {
        if (displayed.isEmpty() && markdown.isNotEmpty()) {
            displayed = markdown
        }
        delay(debounceMs)
        displayed = markdown
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
