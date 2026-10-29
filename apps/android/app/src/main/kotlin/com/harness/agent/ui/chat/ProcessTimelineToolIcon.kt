package com.harness.agent.ui.chat

import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.AccessTime
import androidx.compose.material.icons.rounded.Article
import androidx.compose.material.icons.rounded.Extension
import androidx.compose.material.icons.rounded.ManageSearch
import androidx.compose.material.icons.rounded.Search
import androidx.compose.material.icons.rounded.Terminal
import androidx.compose.ui.graphics.vector.ImageVector

/** 对齐 `@harness/agent-conversation` `processTimelineToolIconKind`。 */
internal enum class ProcessTimelineToolIconKind {
    Search,
    FileSearch,
    FileText,
    Terminal,
    Clock,
    Plug,
}

internal fun processTimelineToolIconKind(toolName: String): ProcessTimelineToolIconKind {
    if (toolName == "web_search" || toolName == "web_fetch") return ProcessTimelineToolIconKind.Search
    if (
        toolName == "search_file" ||
            toolName == "read_file" ||
            toolName == "read_file_lines"
    ) {
        return ProcessTimelineToolIconKind.FileSearch
    }
    if (toolName == "create_file" || toolName == "create_report") {
        return ProcessTimelineToolIconKind.FileText
    }
    if (toolName == "bash") return ProcessTimelineToolIconKind.Terminal
    if (toolName == "get_current_time" || toolName == "execute_command") {
        return ProcessTimelineToolIconKind.Clock
    }
    if (toolName.startsWith("mcp__")) return ProcessTimelineToolIconKind.Plug
    return ProcessTimelineToolIconKind.Clock
}

internal fun ProcessTimelineToolIconKind.toImageVector(): ImageVector =
    when (this) {
        ProcessTimelineToolIconKind.Search -> Icons.Rounded.Search
        ProcessTimelineToolIconKind.FileSearch -> Icons.Rounded.ManageSearch
        ProcessTimelineToolIconKind.FileText -> Icons.Rounded.Article
        ProcessTimelineToolIconKind.Terminal -> Icons.Rounded.Terminal
        ProcessTimelineToolIconKind.Clock -> Icons.Rounded.AccessTime
        ProcessTimelineToolIconKind.Plug -> Icons.Rounded.Extension
    }

internal fun processTimelineToolRailIcon(toolName: String): ImageVector =
    processTimelineToolIconKind(toolName).toImageVector()
