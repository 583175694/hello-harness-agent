package com.harness.agent.settings

import com.harness.agent.core.CoreServices
import com.harness.mobile.core.api.ApiProblem
import com.harness.mobile.core.api.McpCreateServerRequest
import com.harness.mobile.core.api.McpUpdateServerRequest
import com.harness.mobile.core.data.HarnessMcpClient

class ProductionMcpSettingsBackend(
    services: CoreServices,
) : McpSettingsBackend {
    private val client = HarnessMcpClient.create(services.engineConfig())

    override suspend fun listServers(): List<McpServerUiModel> =
        client.listServers().servers.map { server ->
            McpServerUiModel(
                id = server.id,
                serverName = server.serverName,
                url = server.url,
                enabled = server.enabled,
                statusLabel = server.status,
            )
        }

    override suspend fun saveServer(
        id: String?,
        serverName: String,
        url: String,
        enabled: Boolean,
    ): Result<Unit> =
        runCatching {
            if (id.isNullOrBlank()) {
                client.createServer(
                    McpCreateServerRequest(
                        serverName = serverName.trim(),
                        url = url.trim(),
                        enabled = enabled,
                    ),
                )
            } else {
                client.updateServer(
                    id,
                    McpUpdateServerRequest(
                        serverName = serverName.trim(),
                        url = url.trim(),
                        enabled = enabled,
                    ),
                )
            }
            Unit
        }.mapError()

    override suspend fun deleteServer(id: String): Result<Unit> =
        runCatching {
            client.deleteServer(id)
            Unit
        }.mapError()

    override suspend fun testServer(id: String): Result<McpTestResult> =
        runCatching {
            val result = client.testServer(id)
            McpTestResult(
                ok = result.ok,
                message =
                    when {
                        result.ok -> "连接成功（${result.toolNames.size} 个工具）"
                        else -> result.error ?: "连接失败"
                    },
            )
        }.mapError()

    private fun <T> Result<T>.mapError(): Result<T> =
        fold(
            onSuccess = { Result.success(it) },
            onFailure = { error ->
                val message =
                    (error as? ApiProblem)?.problem?.detail
                        ?: error.message
                        ?: "MCP 请求失败"
                Result.failure(IllegalStateException(message, error))
            },
        )
}
