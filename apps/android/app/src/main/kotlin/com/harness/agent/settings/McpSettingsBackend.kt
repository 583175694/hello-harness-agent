package com.harness.agent.settings

/** Phase A Preview / Phase B Production 共用 MCP 设置屏数据源。 */
interface McpSettingsBackend {
    suspend fun listServers(): List<McpServerUiModel>

    suspend fun saveServer(
        id: String?,
        serverName: String,
        url: String,
        enabled: Boolean,
    ): Result<Unit>

    suspend fun deleteServer(id: String): Result<Unit>

    suspend fun testServer(id: String): Result<McpTestResult>
}

data class McpServerUiModel(
    val id: String,
    val serverName: String,
    val url: String,
    val enabled: Boolean,
    val statusLabel: String? = null,
)

data class McpTestResult(
    val ok: Boolean,
    val message: String,
)
