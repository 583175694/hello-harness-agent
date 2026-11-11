package com.harness.mobile.core.api

import kotlinx.serialization.Serializable

@Serializable
data class McpServerView(
    val id: String,
    val serverName: String,
    val enabled: Boolean,
    val url: String,
    val status: String = "disconnected",
    val toolCountExposed: Int = 0,
    val lastError: String? = null,
)

@Serializable
data class McpServerListResponse(
    val servers: List<McpServerView> = emptyList(),
    val catalogGeneration: Int = 0,
)

@Serializable
data class McpCreateServerRequest(
    val serverName: String,
    val enabled: Boolean = true,
    val url: String,
    val headersPlain: Map<String, String> = emptyMap(),
    val startupTimeoutMs: Int = 30_000,
    val toolCallTimeoutMs: Int = 60_000,
    val required: Boolean = false,
    val failOnStartupError: Boolean = false,
    val defaultApproval: String = "require_approval",
    val maxInstructionBytes: Int = 32_768,
    val reconnectEnabled: Boolean = true,
    val reconnectMaxAttempts: Int = 5,
)

@Serializable
data class McpUpdateServerRequest(
    val serverName: String? = null,
    val enabled: Boolean? = null,
    val url: String? = null,
    val headersPlain: Map<String, String>? = null,
    val startupTimeoutMs: Int? = null,
    val toolCallTimeoutMs: Int? = null,
    val required: Boolean? = null,
    val failOnStartupError: Boolean? = null,
    val defaultApproval: String? = null,
    val maxInstructionBytes: Int? = null,
    val reconnectEnabled: Boolean? = null,
    val reconnectMaxAttempts: Int? = null,
)

@Serializable
data class McpPatchServerRequest(
    val enabled: Boolean? = null,
)

@Serializable
data class McpServerTestResponse(
    val ok: Boolean,
    val toolNames: List<String> = emptyList(),
    val error: String? = null,
)
