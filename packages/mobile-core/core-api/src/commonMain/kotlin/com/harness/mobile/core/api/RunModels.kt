package com.harness.mobile.core.api

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject

@Serializable
data class CreateRunResponse(
    val sessionId: String,
    val runId: String,
    val userMessageId: String,
    val assistantMessageId: String,
    val status: String,
    val eventsUrl: String,
)

@Serializable
data class RunSnapshot(
    val runId: String,
    val sessionId: String,
    val status: String,
    val assistantMessageId: String,
    val assistantContent: String = "",
    val blocks: List<JsonElement> = emptyList(),
    val lastEventSequence: Int = 0,
    /** `GET /runs/:id` 补水：pending clarification / tool_approval（B4）。 */
    val activeInterrupt: JsonElement? = null,
    val plan: JsonObject? = null,
)

@Serializable
data class CancelRunResponse(
    val runId: String,
    val status: String,
)

@Serializable
data class RunStreamEvent(
    val seq: Int,
    val sessionId: String,
    val runId: String,
    val type: String,
    val payload: JsonElement? = null,
)

data class SubmitComposerRequest(
    val sessionId: String?,
    val text: String,
    val model: String,
    val reasoningEffort: String = "off",
)
