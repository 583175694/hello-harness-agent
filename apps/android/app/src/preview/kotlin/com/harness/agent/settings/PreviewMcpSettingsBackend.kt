package com.harness.agent.settings

import com.harness.agent.preview.PreviewAppPreferences
import com.harness.agent.preview.PreviewMcpServer
import java.util.UUID

class PreviewMcpSettingsBackend(
    private val preferences: PreviewAppPreferences,
) : McpSettingsBackend {
    override suspend fun listServers(): List<McpServerUiModel> =
        preferences.mcpServers.map { it.toUi() }

    override suspend fun saveServer(
        id: String?,
        serverName: String,
        url: String,
        enabled: Boolean,
    ): Result<Unit> =
        runCatching {
            val resolvedId = id ?: UUID.randomUUID().toString()
            preferences.upsertMcpServer(
                PreviewMcpServer(
                    id = resolvedId,
                    serverName = serverName.trim(),
                    url = url.trim(),
                    enabled = enabled,
                ),
            )
        }

    override suspend fun deleteServer(id: String): Result<Unit> =
        runCatching {
            preferences.deleteMcpServer(id)
        }

    override suspend fun testServer(id: String): Result<McpTestResult> =
        Result.success(McpTestResult(ok = true, message = "连接成功（Preview）"))

    private fun PreviewMcpServer.toUi(): McpServerUiModel =
        McpServerUiModel(
            id = id,
            serverName = serverName,
            url = url,
            enabled = enabled,
        )
}
