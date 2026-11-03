package com.harness.mobile.core.data

import com.harness.mobile.core.api.EngineConfig
import com.harness.mobile.core.api.SkillsListResponse
import io.ktor.client.HttpClient
import io.ktor.client.call.body
import io.ktor.client.request.get
import io.ktor.client.request.header
import io.ktor.client.statement.HttpResponse
import io.ktor.http.encodeURLParameter
import io.ktor.http.isSuccess

class HarnessSkillsClient internal constructor(
    private val config: EngineConfig,
    private val httpClient: HttpClient,
) {
    suspend fun listSkills(query: String? = null): SkillsListResponse {
        val base = HarnessAgentHttpClient.normalizeBaseUrl(config.apiBaseUrlProvider())
        val suffix =
            query?.trim()?.takeIf { it.isNotEmpty() }?.let { q -> "?query=${q.encodeURLParameter()}" }.orEmpty()
        val response =
            httpClient.get("$base/api/skills$suffix") {
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
        fun create(config: EngineConfig): HarnessSkillsClient =
            HarnessSkillsClient(config, HarnessAgentHttpClient.createDefaultClient())
    }
}
