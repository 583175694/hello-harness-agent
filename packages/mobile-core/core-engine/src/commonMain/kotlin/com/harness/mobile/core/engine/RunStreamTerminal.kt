package com.harness.mobile.core.engine

import com.harness.mobile.core.api.RunStreamEvent
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive

fun isTerminalRunStreamEvent(event: RunStreamEvent): Boolean {
    if (
        event.type == "run.completed" ||
        event.type == "run.failed" ||
        event.type == "run.cancelled"
    ) {
        return true
    }
    if (event.type == "run.snapshot") {
        val payload = event.payload
        if (payload is JsonObject) {
            val status = payload["status"]?.jsonPrimitive?.content
            if (status != null && isRunTerminalStatus(status)) {
                return true
            }
        } else if (payload != null) {
            val status =
                runCatching {
                    Json { ignoreUnknownKeys = true }
                        .parseToJsonElement(payload.toString())
                        .jsonObject["status"]
                        ?.jsonPrimitive
                        ?.content
                }.getOrNull()
            if (status != null && isRunTerminalStatus(status)) {
                return true
            }
        }
    }
    return false
}

fun isRunTerminalStatus(status: String): Boolean =
    status == "completed" || status == "failed" || status == "cancelled"
