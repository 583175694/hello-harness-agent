package com.harness.agent.ui.chat

import com.harness.agent.model.ProcessBlock

/** 对齐 Web `formatProcessElapsedLabel`（折叠头，中文）。 */
internal fun formatProcessTimelineHeaderLabel(
    blocks: List<ProcessBlock>,
    running: Boolean,
): String {
    var ms = 0L
    blocks.forEach { block ->
        when (block) {
            is ProcessBlock.Reasoning -> ms += block.durationMs ?: 0L
            is ProcessBlock.ToolActivity -> {
                val digits = block.duration?.filter { it.isDigit() }?.toLongOrNull()
                if (digits != null) ms += digits * 1000
            }
            else -> Unit
        }
    }
    if (ms <= 0) return if (running) "处理过程" else "处理过程"
    val totalSeconds = (ms / 1000).toInt().coerceAtLeast(0)
    if (totalSeconds < 60) return "已用时 ${totalSeconds} 秒"
    return "已用时 ${totalSeconds / 60} 分 ${totalSeconds % 60}秒"
}

/** 对齐 RN `reasoningTriggerLabel`（推理行，英文）。 */
internal fun reasoningTriggerLabel(
    streaming: Boolean,
    durationMs: Long?,
): String {
    if (streaming) return "Thinking..."
    if (durationMs != null) {
        val seconds = (durationMs / 1000).coerceAtLeast(0)
        return "Thought for $seconds seconds"
    }
    return "Thought"
}

/** 对齐 Web `agent-chain-of-thought`：部分工具不 inline summary。 */
internal fun toolActivityInlineSummary(
    toolName: String,
    title: String,
    summary: String,
): String? {
    if (summary.isBlank() || summary == title) return null
    val n = toolName.lowercase()
    if (n == "web_search" || n == "web_fetch") return null
    if (n.contains("bash") || n.contains("command") || n.contains("terminal")) return null
    return summary
}

internal fun toolActivityPrimaryLine(
    toolName: String,
    title: String,
    summary: String,
): String {
    if (toolActivityInlineSummary(toolName, title, summary) != null) return title
    val n = toolName.lowercase()
    if ((n == "web_search" || n == "web_fetch") && summary.isNotBlank() && summary != title) {
        return "搜索：$summary"
    }
    return title.ifBlank { "tool" }
}

internal fun toolActivityAccessibilityLabel(
    toolName: String,
    title: String,
    summary: String,
): String {
    val inline = toolActivityInlineSummary(toolName, title, summary)
    val line = toolActivityPrimaryLine(toolName, title, summary)
    return if (inline != null) "$line，$inline" else line
}
