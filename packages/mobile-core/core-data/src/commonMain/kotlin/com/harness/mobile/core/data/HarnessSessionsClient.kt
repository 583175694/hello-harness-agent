package com.harness.mobile.core.data

import com.harness.mobile.core.api.CreateSessionResponse
import com.harness.mobile.core.api.DeleteSessionResponse
import com.harness.mobile.core.api.EngineConfig
import com.harness.mobile.core.api.ListSessionsResponse
import com.harness.mobile.core.api.SessionDetailResponse
import com.harness.mobile.core.api.UpdateSessionRequest
import com.harness.mobile.core.api.UpdateSessionResponse
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
import kotlinx.serialization.Serializable

class HarnessSessionsClient internal constructor(
    private val config: EngineConfig,
    private val httpClient: HttpClient,
) {
    suspend fun listSessions(): ListSessionsResponse {
        val base = HarnessAgentHttpClient.normalizeBaseUrl(config.apiBaseUrlProvider())
        val response =
            httpClient.get("$base/api/agent/sessions") {
                applyAuth()
            }
        return parseOk(response)
    }

    suspend fun getSession(
        sessionId: String,
        limit: Int = 100,
        before: String? = null,
    ): SessionDetailResponse {
        val base = HarnessAgentHttpClient.normalizeBaseUrl(config.apiBaseUrlProvider())
        val query =
            buildString {
                append("?limit=$limit")
                if (!before.isNullOrBlank()) append("&before=$before")
            }
        val response =
            httpClient.get("$base/api/agent/sessions/$sessionId$query") {
                applyAuth()
            }
        return parseOk(response)
    }

    suspend fun createSession(title: String): CreateSessionResponse {
        val base = HarnessAgentHttpClient.normalizeBaseUrl(config.apiBaseUrlProvider())
        val response =
            httpClient.post("$base/api/agent/sessions") {
                contentType(ContentType.Application.Json)
                setBody(CreateSessionBody(title = title.trim()))
                applyAuth()
            }
        return parseOk(response)
    }

    suspend fun updateSession(
        sessionId: String,
        request: UpdateSessionRequest,
    ): UpdateSessionResponse {
        val base = HarnessAgentHttpClient.normalizeBaseUrl(config.apiBaseUrlProvider())
        val response =
            httpClient.patch("$base/api/agent/sessions/$sessionId") {
                contentType(ContentType.Application.Json)
                setBody(request)
                applyAuth()
            }
        return parseOk(response)
    }

    suspend fun deleteSession(sessionId: String): DeleteSessionResponse {
        val base = HarnessAgentHttpClient.normalizeBaseUrl(config.apiBaseUrlProvider())
        val response =
            httpClient.delete("$base/api/agent/sessions/$sessionId") {
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
        fun create(config: EngineConfig): HarnessSessionsClient =
            HarnessSessionsClient(config, HarnessAgentHttpClient.createDefaultClient())
    }

    @Serializable
    private data class CreateSessionBody(val title: String)
}
