package com.harness.mobile.core.data

import com.harness.mobile.core.api.EngineConfig
import com.harness.mobile.core.api.McpCreateServerRequest
import com.harness.mobile.core.api.McpPatchServerRequest
import com.harness.mobile.core.api.McpServerListResponse
import com.harness.mobile.core.api.McpServerTestResponse
import com.harness.mobile.core.api.McpServerView
import com.harness.mobile.core.api.McpUpdateServerRequest
import io.ktor.client.HttpClient
import io.ktor.client.call.body
import io.ktor.client.request.delete
import io.ktor.client.request.get
import io.ktor.client.request.header
import io.ktor.client.request.patch
import io.ktor.client.request.post
import io.ktor.client.request.put
import io.ktor.client.request.setBody
import io.ktor.client.statement.HttpResponse
import io.ktor.http.ContentType
import io.ktor.http.contentType
import io.ktor.http.isSuccess

class HarnessMcpClient internal constructor(
    private val config: EngineConfig,
    private val httpClient: HttpClient,
) {
    suspend fun listServers(): McpServerListResponse {
        val base = HarnessAgentHttpClient.normalizeBaseUrl(config.apiBaseUrlProvider())
        val response =
            httpClient.get("$base/api/agent/mcp/servers") {
                applyAuth()
            }
        return parseOk(response)
    }

    suspend fun createServer(body: McpCreateServerRequest): McpServerView {
        val base = HarnessAgentHttpClient.normalizeBaseUrl(config.apiBaseUrlProvider())
        val response =
            httpClient.post("$base/api/agent/mcp/servers") {
                contentType(ContentType.Application.Json)
                setBody(body)
                applyAuth()
            }
        return parseOk(response)
    }

    suspend fun updateServer(
        id: String,
        body: McpUpdateServerRequest,
    ): McpServerView {
        val base = HarnessAgentHttpClient.normalizeBaseUrl(config.apiBaseUrlProvider())
        val response =
            httpClient.put("$base/api/agent/mcp/servers/$id") {
                contentType(ContentType.Application.Json)
                setBody(body)
                applyAuth()
            }
        return parseOk(response)
    }

    suspend fun patchServer(
        id: String,
        enabled: Boolean,
    ): McpServerView {
        val base = HarnessAgentHttpClient.normalizeBaseUrl(config.apiBaseUrlProvider())
        val response =
            httpClient.patch("$base/api/agent/mcp/servers/$id") {
                contentType(ContentType.Application.Json)
                setBody(McpPatchServerRequest(enabled = enabled))
                applyAuth()
            }
        return parseOk(response)
    }

    suspend fun deleteServer(id: String) {
        val base = HarnessAgentHttpClient.normalizeBaseUrl(config.apiBaseUrlProvider())
        val response =
            httpClient.delete("$base/api/agent/mcp/servers/$id") {
                applyAuth()
            }
        if (!response.status.isSuccess()) {
            HarnessAgentHttpClient.throwApiProblem(response)
        }
    }

    suspend fun testServer(id: String): McpServerTestResponse {
        val base = HarnessAgentHttpClient.normalizeBaseUrl(config.apiBaseUrlProvider())
        val response =
            httpClient.post("$base/api/agent/mcp/servers/$id/test") {
                applyAuth()
            }
        return parseOk(response)
    }

    private suspend fun io.ktor.client.request.HttpRequestBuilder.applyAuth() {
        val cookie = config.getSessionCookieHeader()?.trim().orEmpty()
        if (cookie.isNotEmpty()) {
            header("Cookie", cookie)
        }
    }

    private suspend inline fun <reified T> parseOk(response: HttpResponse): T {
        if (response.status.isSuccess()) {
            return response.body()
        }
        HarnessAgentHttpClient.throwApiProblem(response)
    }

    companion object {
        fun create(config: EngineConfig): HarnessMcpClient =
            HarnessMcpClient(config, HarnessAgentHttpClient.createDefaultClient())

        internal fun create(
            config: EngineConfig,
            httpClient: HttpClient,
        ): HarnessMcpClient = HarnessMcpClient(config, httpClient)
    }
}
