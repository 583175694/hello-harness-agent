package com.harness.mobile.core.api

/** 将 UI 模型/推理选择归一化为 createRun 请求（E20 前须已加载 [PublicAgentConfig]）。 */
fun resolveComposerRunModel(
    publicConfig: PublicAgentConfig,
    modelId: String?,
    reasoningEffort: String?,
): Pair<String, String> {
    val model = modelId?.trim()?.takeIf { it.isNotEmpty() } ?: publicConfig.defaultModel
    val cfg = publicConfig.models.firstOrNull { it.id == model }
    val requested = reasoningEffort?.trim()?.takeIf { it.isNotEmpty() }
    val reasoning =
        when {
            cfg != null && requested != null && requested in cfg.reasoning.levels -> requested
            cfg != null -> cfg.reasoning.default
            else -> "off"
        }
    return model to reasoning
}
