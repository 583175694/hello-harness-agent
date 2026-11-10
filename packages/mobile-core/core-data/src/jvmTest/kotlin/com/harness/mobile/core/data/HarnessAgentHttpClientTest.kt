package com.harness.mobile.core.data

import com.harness.mobile.core.api.ApiProblem
import com.harness.mobile.core.api.EngineConfig
import io.ktor.client.HttpClient
import io.ktor.client.engine.mock.MockEngine
import io.ktor.client.engine.mock.respond
import io.ktor.client.plugins.HttpTimeout
import io.ktor.client.plugins.contentnegotiation.ContentNegotiation
import io.ktor.http.HttpHeaders
import io.ktor.http.HttpStatusCode
import io.ktor.http.headersOf
import io.ktor.serialization.kotlinx.json.json
import kotlinx.coroutines.runBlocking
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertTrue
import kotlinx.coroutines.delay
import io.ktor.client.engine.mock.MockEngineConfig

class HarnessAgentHttpClientTest {
    @Test
    fun getReadinessParsesOk() {
        val engine =
            MockEngine { request ->
                assertTrue(request.url.encodedPath.endsWith("/readyz"))
                assertEquals("harness_session=abc", request.headers[HttpHeaders.Cookie])
                respond(
                    content = """{"status":"ok","service":"api","version":"0.1.0"}""",
                    status = HttpStatusCode.OK,
                    headers = headersOf(HttpHeaders.ContentType, "application/json"),
                )
            }
        val config =
            EngineConfig(
                apiBaseUrlProvider = { "http://127.0.0.1:4318" },
                getSessionCookieHeader = { "harness_session=abc" },
            )
        val client =
            HarnessAgentHttpClient(
                config,
                HttpClient(engine) {
                    install(ContentNegotiation) {
                        json()
                    }
                },
            )
        runBlocking {
            val status = client.getReadiness()
            assertEquals("ok", status.status)
            assertTrue(status.isReady)
        }
    }

    @Test
    fun getReadinessProblemDetails() {
        val engine =
            MockEngine {
                respond(
                    content =
                        """{"type":"t","title":"Not ready","status":503,"code":"NOT_READY","detail":"db down"}""",
                    status = HttpStatusCode.ServiceUnavailable,
                    headers = headersOf(HttpHeaders.ContentType, "application/json"),
                )
            }
        val config =
            EngineConfig(apiBaseUrlProvider = { "http://127.0.0.1:4318" }, getSessionCookieHeader = { null })
        val client =
            HarnessAgentHttpClient(
                config,
                HttpClient(engine) {
                    install(ContentNegotiation) {
                        json()
                    }
                },
            )
        runBlocking {
            val error =
                assertFailsWith<ApiProblem> {
                    client.getReadiness()
                }
            assertEquals("NOT_READY", error.problem.code)
        }
    }

    @Test
    fun requestTimeoutFailsInsteadOfHanging() {
        val engine =
            MockEngine {
                delay(200)
                respond(
                    content = """{"status":"ok","service":"api","version":"0.1.0"}""",
                    status = HttpStatusCode.OK,
                    headers = headersOf(HttpHeaders.ContentType, "application/json"),
                )
            }
        val config =
            EngineConfig(apiBaseUrlProvider = { "http://127.0.0.1:4318" }, getSessionCookieHeader = { null })
        val client =
            HarnessAgentHttpClient(
                config,
                HttpClient(engine) {
                    install(HttpTimeout) {
                        requestTimeoutMillis = 50
                    }
                    install(ContentNegotiation) {
                        json()
                    }
                },
            )
        runBlocking {
            assertFailsWith<io.ktor.client.plugins.HttpRequestTimeoutException> {
                client.getReadiness()
            }
        }
    }
}
