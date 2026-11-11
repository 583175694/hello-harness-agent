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
                    MemoryEntryUiModel(
                        id = entry.id,
                        title = entry.title,
                        kind = entry.kind,
                        text = entry.text,
                    )
                },
        )

    override suspend fun entry(id: String): MemoryEntryUiModel? =
        preferences.memoryEntries.find { it.id == id }?.let { row ->
            MemoryEntryUiModel(
                id = row.id,
                title = row.title,
                kind = row.kind,
                text = row.text,
            )
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
        runCatching {
            preferences.updateAllowAgentMemoryWrite(enabled)
        }

    override suspend fun deleteEntry(id: String): Result<Unit> =
        runCatching {
            preferences.deleteMemoryEntry(id)
        }
}
