package com.harness.mobile.core.data

import kotlinx.serialization.Serializable
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import kotlin.test.Test
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class CreateRunBodyJsonTest {
    @Serializable
    private data class Body(
        val content: String,
        val model: String,
        val reasoningEffort: String,
        val idempotencyKey: String,
        val skillNames: List<String>? = null,
        val attachmentIds: List<String>? = null,
    )

    private val json =
        Json {
            ignoreUnknownKeys = true
            isLenient = true
        }

    @Test
    fun defaultJsonDoesNotEmitNullOptionalArrays() {
        val text =
            json.encodeToString(
                Body(
                    content = "hello",
                    model = "test-model",
                    reasoningEffort = "high",
                    idempotencyKey = "idem-1",
                ),
            )
        assertFalse(text.contains("skillNames"), text)
        assertFalse(text.contains("attachmentIds"), text)
        assertTrue(text.contains("idempotencyKey"), text)
    }
}
