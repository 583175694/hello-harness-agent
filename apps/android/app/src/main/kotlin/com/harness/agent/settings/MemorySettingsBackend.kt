package com.harness.agent.settings

interface MemorySettingsBackend {
    suspend fun load(): MemoryHubState

    suspend fun setAllowAgentWrite(enabled: Boolean): Result<Unit>

    suspend fun entry(id: String): MemoryEntryUiModel?

    suspend fun updateEntry(
        id: String,
        kind: String,
        title: String,
        content: String,
    ): Result<MemoryEntryUiModel>

    suspend fun deleteEntry(id: String): Result<Unit>
}

data class MemoryHubState(
    val allowAgentWrite: Boolean,
    val entries: List<MemoryEntryUiModel>,
)

data class MemoryEntryUiModel(
    val id: String,
    val title: String = "",
    val kind: String = "preference",
    /** 正文 / summary，列表单行预览用此字段。 */
    val text: String,
)
