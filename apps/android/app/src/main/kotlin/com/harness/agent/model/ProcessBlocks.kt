package com.harness.agent.model

sealed class ProcessBlock {
    data class ToolActivity(
        val id: String,
        val name: String,
        val summary: String,
        val status: String,
        val duration: String? = null,
        val statusLabel: String? = null,
    ) : ProcessBlock()

    data class Reasoning(
        val content: String,
        val durationMs: Long? = null,
        val streaming: Boolean = false,
    ) : ProcessBlock()

    data class Text(val content: String) : ProcessBlock()
}
