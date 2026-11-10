package com.harness.mobile.core.api

import kotlinx.serialization.Serializable

@Serializable
data class MemoryRecordView(
    val memoryId: String,
    val kind: String,
    val title: String,
    val summary: String,
    val status: String = "active",
)

@Serializable
data class MemoryListResponse(
    val memories: List<MemoryRecordView> = emptyList(),
    val activeCount: Int = 0,
)

@Serializable
data class MemoryCreateRequest(
    val kind: String,
    val title: String,
    val content: String,
)

@Serializable
data class MemoryCreateResponse(
    val memory: MemoryRecordView,
)

@Serializable
data class MemorySettingsView(
    val allowAgentWrite: Boolean,
)

@Serializable
data class MemorySettingsPatch(
    val allowAgentWrite: Boolean,
)

@Serializable
data class MemoryUpdateRequest(
    val kind: String,
    val title: String,
    val content: String,
)

@Serializable
data class MemoryUpdateResponse(
    val memory: MemoryRecordView,
)
