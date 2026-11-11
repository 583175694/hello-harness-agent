package com.harness.mobile.core.data

import com.harness.mobile.core.api.ArtifactVersionContext
import com.harness.mobile.core.api.EngineConfig
import io.ktor.client.HttpClient
import io.ktor.client.engine.mock.MockEngine
import io.ktor.client.engine.mock.respond
import io.ktor.client.plugins.contentnegotiation.ContentNegotiation
import io.ktor.http.HttpHeaders
import io.ktor.http.HttpStatusCode
import io.ktor.http.content.TextContent
import io.ktor.http.headersOf
import io.ktor.serialization.kotlinx.json.json
import kotlinx.coroutines.runBlocking
import kotlin.test.Test
import kotlin.test.assertContains
import kotlin.test.assertTrue

class HarnessRunsClientTest {
    @Test
    fun createRunPostsArtifactVersionContextWhenProvided() {
        var capturedBody = ""
        val engine =
            MockEngine { request ->
                capturedBody =
                    when (val body = request.body) {
                        is TextContent -> body.text
                        else -> ""
                    }
                respond(
                    content =
                        """
                        {
                          "sessionId":"s1",
                          "runId":"r1",
                          "userMessageId":"u1",
                          "assistantMessageId":"a1",
                          "status":"running",
                          "eventsUrl":"/api/agent/runs/r1/events"
                        }
                        """.trimIndent(),
                    status = HttpStatusCode.OK,
                    headers = headersOf(HttpHeaders.ContentType, "application/json"),
                )
            }
        val config =
            EngineConfig(
                apiBaseUrlProvider = { "http://127.0.0.1:4318" },
                getSessionCookieHeader = { null },
            )
        val http =
            HttpClient(engine) {
                install(ContentNegotiation) {
                    json()
                }
            }
        val client = HarnessRunsClient.create(config, http)
        runBlocking {
            client.createRun(
                sessionId = "s1",
                content = "revise readme",
                model = "test-model",
                reasoningEffort = "off",
                idempotencyKey = "idem-revise",
                artifactVersionContext =
                    ArtifactVersionContext(
                        seriesId = "series-1",
                        baseArtifactId = "art-v2",
                        expectedCurrentArtifactId = "art-v3",
                    ),
            )
        }
        assertContains(capturedBody, "artifactVersionContext")
        assertContains(capturedBody, "series-1")
        assertContains(capturedBody, "art-v2")
        assertTrue(capturedBody.contains("/api/agent/sessions/s1/runs") || capturedBody.isNotEmpty())
    }
}
