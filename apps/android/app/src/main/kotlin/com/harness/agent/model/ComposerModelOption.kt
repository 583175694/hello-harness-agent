package com.harness.agent.model

/** Composer 模型菜单项（Preview 固定表或 Core public config 投影）。 */
data class ComposerModelOption(
    val id: String,
    val label: String,
    val reasoningOptions: List<String>,
)

val PREVIEW_COMPOSER_MODELS: List<ComposerModelOption> =
    listOf(
        ComposerModelOption("deepseek-chat", "DeepSeek Chat", listOf("off", "low", "high")),
        ComposerModelOption("deepseek-reasoner", "DeepSeek Reasoner", listOf("low", "high", "max")),
        ComposerModelOption("fast", "快速", listOf("off")),
    )
