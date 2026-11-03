package com.harness.agent.settings

import com.harness.agent.core.CoreServices
import com.harness.mobile.core.api.ApiProblem
import com.harness.mobile.core.data.HarnessMemoriesClient

class ProductionMemorySettingsBackend(
    services: CoreServices,
) : MemorySettingsBackend {
    private val client = HarnessMemoriesClient.create(services.engineConfig())

    override suspend fun load(): MemoryHubState {
        val settings = client.readMemorySettings()
        val list = client.listMemories()
        return MemoryHubState(
            allowAgentWrite = settings.allowAgentWrite,
            entries =
                list.memories.map { memory ->
                    MemoryEntryUiModel(
                        id = memory.memoryId,
                        text = memory.summary.ifBlank { memory.title },
                    )
                },
        )
    }

    override suspend fun setAllowAgentWrite(enabled: Boolean): Result<Unit> =
        runCatching {
            client.patchMemorySettings(enabled)
            Unit
        }.mapError()

    override suspend fun deleteEntry(id: String): Result<Unit> =
        runCatching {
            client.deleteMemory(id)
            Unit
        }.mapError()

    private fun <T> Result<T>.mapError(): Result<T> =
        fold(
            onSuccess = { Result.success(it) },
            onFailure = { error ->
                val message =
                    (error as? ApiProblem)?.problem?.detail
                        ?: error.message
                        ?: "Memory 请求失败"
                Result.failure(IllegalStateException(message, error))
            },
        )
}
