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
import kotlin.test.Test
import kotlin.test.assertEquals

class HarnessMcpClientTest {
    @Test
    fun listServersUsesAgentMcpPath() {
        var path = ""
        val engine =
            MockEngine { request ->
                path = request.url.encodedPath
                respond(
                    content = """{"servers":[]}""",
                    status = HttpStatusCode.OK,
                    headers = headersOf(HttpHeaders.ContentType, "application/json"),
                )
            }
        val config =
            EngineConfig(
                apiBaseUrlProvider = { "http://127.0.0.1:4318" },
                getSessionCookieHeader = { "harness_session=test" },
            )
        val http =
            HttpClient(engine) {
                install(ContentNegotiation) {
                    json()
                }
            }
        val client = HarnessMcpClient.create(config, httpClient = http)
        runBlocking {
            client.listServers()
        }
        assertEquals("/api/agent/mcp/servers", path)
    }
}
