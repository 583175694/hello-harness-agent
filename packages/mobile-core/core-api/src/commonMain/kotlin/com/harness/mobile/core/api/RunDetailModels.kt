package com.harness.mobile.core.api

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject

@Serializable
data class RunDetailResponse(
    val runId: String,
    val messageId: String,
    val schemaVersion: Int = 1,
    val executions: List<JsonElement> = emptyList(),
    val sources: List<JsonElement> = emptyList(),
    val blocks: List<JsonElement> = emptyList(),
    val plan: JsonObject? = null,
)
