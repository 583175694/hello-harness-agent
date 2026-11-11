package com.harness.mobile.core.api

import kotlinx.serialization.Serializable

@Serializable
data class ServiceStatus(
    val status: String,
    val service: String,
    val version: String,
    val checks: Map<String, String>? = null,
) {
    val isReady: Boolean get() = status == "ok"
}

@Serializable
data class ReasoningCapability(
    val supported: Boolean,
    val levels: List<String>,
    val default: String,
)

@Serializable
data class PublicModelConfig(
    val id: String,
    val label: String,
    val reasoning: ReasoningCapability,
    val supportsVision: Boolean? = null,
)

@Serializable
data class PublicAgentConfig(
    val defaultModel: String,
    val models: List<PublicModelConfig>,
    val capabilities: PublicAgentCapabilities? = null,
)

@Serializable
data class PublicAgentCapabilities(
    val memoryRead: Boolean = false,
    val memoryWrite: Boolean = false,
)

@Serializable
data class FileRef(
    val fileId: String,
    val fileName: String,
    val mediaType: String,
    val size: Int,
    val status: String,
    val errorCode: String? = null,
    val previewUrl: String? = null,
    val fileKind: String? = null,
)

@Serializable
data class SkillListItem(
    val name: String,
    val description: String,
    val version: String,
    val source: String,
)

@Serializable
data class SkillsListResponse(
    val skills: List<SkillListItem>,
)

@Serializable
data class ProblemDetails(
    val type: String,
    val title: String,
    val status: Int,
    val code: String,
    val detail: String,
    val instance: String? = null,
)

class ApiProblem(
    val problem: ProblemDetails,
) : Exception(problemMessage(problem))

/**
 * 平台端只有 message 可用（iOS bridge / ArkTS exception），把状态码与 detail 一并暴露，
 * 否则 401 / 404 只能落到英文 title，阅读器无法给出明确状态。
 */
private fun problemMessage(problem: ProblemDetails): String {
    val detail = problem.detail.trim()
    val suffix = if (detail.isNotEmpty() && detail != problem.title) ": $detail" else ""
    return "HTTP ${problem.status} ${problem.title}$suffix"
}
