package com.harness.mobile.core.data

import com.harness.mobile.core.api.RunControlRespondCommand
import com.harness.mobile.core.api.RunControlRespondPayload
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import kotlin.test.Test
import kotlin.test.assertTrue

class RunControlJsonTest {
    private val json = Json { ignoreUnknownKeys = true; isLenient = true }

    @Test
    fun respondCommandAlwaysIncludesTypeDiscriminant() {
        val text =
            json.encodeToString(
                RunControlRespondCommand(
                    interruptId = "int-1",
                    payload = RunControlRespondPayload(answer = "深圳"),
                ),
            )
        assertTrue(text.contains("\"type\":\"respond\""), text)
    }
}
