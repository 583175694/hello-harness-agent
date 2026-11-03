package com.harness.agent.settings

import com.harness.agent.preview.PreviewAppPreferences

class PreviewMemorySettingsBackend(
    private val preferences: PreviewAppPreferences,
) : MemorySettingsBackend {
    override suspend fun load(): MemoryHubState =
        MemoryHubState(
            allowAgentWrite = preferences.allowAgentMemoryWrite,
            entries =
                preferences.memoryEntries.map { entry ->
                    MemoryEntryUiModel(id = entry.id, text = entry.text)
                },
        )

    override suspend fun setAllowAgentWrite(enabled: Boolean): Result<Unit> =
        runCatching {
            preferences.updateAllowAgentMemoryWrite(enabled)
        }

    override suspend fun deleteEntry(id: String): Result<Unit> =
        runCatching {
            preferences.deleteMemoryEntry(id)
        }
}
