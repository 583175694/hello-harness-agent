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
        val id: String = "",
        val content: String,
        val durationMs: Long? = null,
        val streaming: Boolean = false,
    ) : ProcessBlock()

    data class Text(
        val id: String = "",
        val content: String,
    ) : ProcessBlock()

    val stableId: String
        get() =
            when (this) {
                is ToolActivity -> "tool:$id"
                is Reasoning -> if (id.isBlank()) "reasoning:$content" else "reasoning:$id"
                is Text -> if (id.isBlank()) "text:$content" else "text:$id"
            }

    /**
     * 渲染 key：服务端 block id 优先；缺失时按块类型 + 稳定下标，禁止使用会随 token 变化的内容。
     */
    fun stableKey(index: Int): String =
        when (this) {
            is ToolActivity -> "tool:$id"
            is Reasoning -> if (id.isBlank()) "reasoning:slot-$index" else "reasoning:$id"
            is Text -> if (id.isBlank()) "text:slot-$index" else "text:$id"
        }
}
