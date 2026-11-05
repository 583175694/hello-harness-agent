package com.harness.mobile.core.data

import com.harness.mobile.core.api.EngineConfig
import io.ktor.client.HttpClient
import io.ktor.client.engine.mock.MockEngine
import io.ktor.client.engine.mock.respond
import io.ktor.client.plugins.contentnegotiation.ContentNegotiation
import io.ktor.http.HttpHeaders
import io.ktor.http.HttpStatusCode
import io.ktor.http.headersOf
import io.ktor.serialization.kotlinx.json.json
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.Json
import kotlin.test.Test
import kotlin.test.assertEquals

class HarnessPendingInputsClientTest {
    @Test
    fun submitPendingInputReturnsServerKind() {
        var capturedPath = ""
        val engine =
            MockEngine { request ->
                capturedPath = request.url.encodedPath
                respond(
                    content = """{"kind":"run"}""",
                    status = HttpStatusCode.OK,
                    headers = headersOf(HttpHeaders.ContentType, "application/json"),
                )
            }
        val config =
            EngineConfig(
                apiBaseUrlProvider = { "http://127.0.0.1:4318" },
                getSessionCookieHeader = { "harness_session=abc" },
            )
        val http =
            HttpClient(engine) {
                install(ContentNegotiation) {
                    json(Json { ignoreUnknownKeys = true })
                }
            }
        val client = HarnessPendingInputsClient(config, http)
        runBlocking {
            val kind =
                client.submitPendingInput(
                    sessionId = "s1",
                    content = "继续",
                    idempotencyKey = "idem-1",
                )
            assertEquals("run", kind)
        }
        assertEquals(true, capturedPath.endsWith("/api/agent/sessions/s1/pending-inputs"))
    }
}
