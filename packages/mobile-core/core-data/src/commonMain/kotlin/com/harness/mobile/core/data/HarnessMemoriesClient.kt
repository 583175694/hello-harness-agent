package com.harness.mobile.core.data

import com.harness.mobile.core.api.EngineConfig
import com.harness.mobile.core.api.MemoryCreateRequest
import com.harness.mobile.core.api.MemoryCreateResponse
import com.harness.mobile.core.api.MemoryListResponse
import com.harness.mobile.core.api.MemoryRecordView
import com.harness.mobile.core.api.MemorySettingsPatch
import com.harness.mobile.core.api.MemorySettingsView
import io.ktor.client.HttpClient
import io.ktor.client.call.body
import io.ktor.client.request.delete
import io.ktor.client.request.get
import io.ktor.client.request.header
import io.ktor.client.request.patch
import io.ktor.client.request.post
import io.ktor.client.request.setBody
import io.ktor.client.statement.HttpResponse
import io.ktor.http.ContentType
import io.ktor.http.contentType
import io.ktor.http.isSuccess

class HarnessMemoriesClient internal constructor(
    private val config: EngineConfig,
    private val httpClient: HttpClient,
) {
    suspend fun listMemories(): MemoryListResponse {
        val base = HarnessAgentHttpClient.normalizeBaseUrl(config.apiBaseUrlProvider())
        val response =
            httpClient.get("$base/api/agent/memories") {
                applyAuth()
            }
        return parseOk(response)
    }

    suspend fun createMemory(body: MemoryCreateRequest): MemoryRecordView {
        val base = HarnessAgentHttpClient.normalizeBaseUrl(config.apiBaseUrlProvider())
        val response =
            httpClient.post("$base/api/agent/memories") {
                contentType(ContentType.Application.Json)
                setBody(body)
                applyAuth()
            }
        val wrapped: MemoryCreateResponse = parseOk(response)
        return wrapped.memory
    }

    suspend fun deleteMemory(memoryId: String) {
        val base = HarnessAgentHttpClient.normalizeBaseUrl(config.apiBaseUrlProvider())
        val response =
            httpClient.delete("$base/api/agent/memories/$memoryId") {
                applyAuth()
            }
        if (!response.status.isSuccess()) {
            HarnessAgentHttpClient.throwApiProblem(response)
        }
    }

    suspend fun readMemorySettings(): MemorySettingsView {
        val base = HarnessAgentHttpClient.normalizeBaseUrl(config.apiBaseUrlProvider())
        val response =
            httpClient.get("$base/api/agent/memory-settings") {
                applyAuth()
            }
        return parseOk(response)
    }

    suspend fun patchMemorySettings(allowAgentWrite: Boolean): MemorySettingsView {
        val base = HarnessAgentHttpClient.normalizeBaseUrl(config.apiBaseUrlProvider())
        val response =
            httpClient.patch("$base/api/agent/memory-settings") {
                contentType(ContentType.Application.Json)
                setBody(MemorySettingsPatch(allowAgentWrite = allowAgentWrite))
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
        fun create(config: EngineConfig): HarnessMemoriesClient =
            HarnessMemoriesClient(config, HarnessAgentHttpClient.createDefaultClient())

        internal fun create(
            config: EngineConfig,
            httpClient: HttpClient,
        ): HarnessMemoriesClient = HarnessMemoriesClient(config, httpClient)
    }
}
