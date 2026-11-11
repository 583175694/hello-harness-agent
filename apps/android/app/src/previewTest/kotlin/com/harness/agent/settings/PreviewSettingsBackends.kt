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
            preferences.upsertMcpServer(
                PreviewMcpServer(
                    id = id ?: UUID.randomUUID().toString(),
                    serverName = serverName.trim(),
                    url = url.trim(),
                    enabled = enabled,
                ),
            )
        }

    override suspend fun deleteServer(id: String): Result<Unit> =
        runCatching { preferences.deleteMcpServer(id) }

    override suspend fun testServer(id: String): Result<McpTestResult> =
        Result.success(McpTestResult(ok = true, message = "连接成功（Preview）"))

    private fun PreviewMcpServer.toUi(): McpServerUiModel =
        McpServerUiModel(id = id, serverName = serverName, url = url, enabled = enabled)
}

class PreviewMemorySettingsBackend(
    private val preferences: PreviewAppPreferences,
) : MemorySettingsBackend {
    override suspend fun load(): MemoryHubState =
        MemoryHubState(
            allowAgentWrite = preferences.allowAgentMemoryWrite,
            entries =
                preferences.memoryEntries.map { entry ->
                    MemoryEntryUiModel(id = entry.id, title = entry.title, kind = entry.kind, text = entry.text)
                },
        )

    override suspend fun entry(id: String): MemoryEntryUiModel? =
        preferences.memoryEntries.find { it.id == id }?.let { row ->
            MemoryEntryUiModel(id = row.id, title = row.title, kind = row.kind, text = row.text)
        }

    override suspend fun updateEntry(
        id: String,
        kind: String,
        title: String,
        content: String,
    ): Result<MemoryEntryUiModel> =
        runCatching {
            preferences.updateMemoryEntry(id, title = title, kind = kind, text = content.trim())
            MemoryEntryUiModel(id = id, title = title, kind = kind, text = content.trim())
        }

    override suspend fun setAllowAgentWrite(enabled: Boolean): Result<Unit> =
        runCatching { preferences.updateAllowAgentMemoryWrite(enabled) }

    override suspend fun deleteEntry(id: String): Result<Unit> =
        runCatching { preferences.deleteMemoryEntry(id) }
}
