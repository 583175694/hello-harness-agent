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
import com.harness.mobile.core.api.ApiProblem
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertTrue

class HarnessArtifactsClientTest {
    @Test
    fun restoreArtifactPostsExpectedBody() {
        var capturedPath = ""
        val engine =
            MockEngine { request ->
                capturedPath = request.url.encodedPath
                respond(
                    content =
                        """
                        {
                          "artifact":{"artifactId":"a-new","fileId":"f1","fileName":"README.md"},
                          "file":{"fileId":"f1","fileName":"README.md","mediaType":"text/markdown","size":1,"status":"ready"},
                          "series":{"seriesId":"s1","sessionId":"sess","logicalName":"README.md","versions":[]}
                        }
                        """.trimIndent(),
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
                    json()
                }
            }
        val client = HarnessArtifactsClient.create(config, http)
        runBlocking {
            client.restoreArtifact(
                artifactId = "art-v2",
                expectedCurrentArtifactId = "art-v3",
                idempotencyKey = "idem-1",
            )
        }
        assertTrue(capturedPath.endsWith("/api/agent/artifacts/art-v2/restore"))
    }

    @Test
    fun restoreArtifactConflictSurfacesProblemDetails() {
        val engine =
            MockEngine {
                respond(
                    content =
                        """
                        {
                          "type": "about:blank",
                          "title": "版本已变更",
                          "status": 409,
                          "detail": "当前 head 已不是 expected",
                          "code": "ARTIFACT_VERSION_CONFLICT"
                        }
                        """.trimIndent(),
                    status = HttpStatusCode.Conflict,
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
                    json()
                }
            }
        val client = HarnessArtifactsClient.create(config, http)
        val thrown =
            assertFailsWith<ApiProblem> {
                runBlocking {
                    client.restoreArtifact(
                        artifactId = "art-v2",
                        expectedCurrentArtifactId = "stale-head",
                        idempotencyKey = "idem-conflict",
                    )
                }
            }
        assertEquals(409, thrown.problem.status)
        assertEquals("ARTIFACT_VERSION_CONFLICT", thrown.problem.code)
        assertEquals("版本已变更", thrown.problem.title)
    }
}
