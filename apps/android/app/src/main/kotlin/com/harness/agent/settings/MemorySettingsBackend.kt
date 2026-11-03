package com.harness.agent.settings

interface MemorySettingsBackend {
    suspend fun load(): MemoryHubState

    suspend fun setAllowAgentWrite(enabled: Boolean): Result<Unit>

    suspend fun deleteEntry(id: String): Result<Unit>
}

data class MemoryHubState(
    val allowAgentWrite: Boolean,
    val entries: List<MemoryEntryUiModel>,
)

data class MemoryEntryUiModel(
    val id: String,
    val text: String,
)
