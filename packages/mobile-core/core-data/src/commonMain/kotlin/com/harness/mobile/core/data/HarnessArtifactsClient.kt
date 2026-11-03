package com.harness.mobile.core.data

import com.harness.mobile.core.api.EngineConfig
import com.harness.mobile.core.api.RestoreArtifactRequest
import com.harness.mobile.core.api.RestoreArtifactResult
import io.ktor.client.HttpClient
import io.ktor.client.call.body
import io.ktor.client.request.header
import io.ktor.client.request.post
import io.ktor.client.request.setBody
import io.ktor.client.statement.HttpResponse
import io.ktor.http.ContentType
import io.ktor.http.contentType
import io.ktor.http.isSuccess

class HarnessArtifactsClient internal constructor(
    private val config: EngineConfig,
    private val httpClient: HttpClient,
) {
    suspend fun restoreArtifact(
        artifactId: String,
        expectedCurrentArtifactId: String,
        idempotencyKey: String,
    ): RestoreArtifactResult {
        val base = HarnessAgentHttpClient.normalizeBaseUrl(config.apiBaseUrlProvider())
        val response =
            httpClient.post("$base/api/agent/artifacts/$artifactId/restore") {
                contentType(ContentType.Application.Json)
                setBody(
                    RestoreArtifactRequest(
                        expectedCurrentArtifactId = expectedCurrentArtifactId,
                        idempotencyKey = idempotencyKey,
                    ),
                )
                applyAuth()
            }
        return parseOk(response)
    }

    private suspend fun io.ktor.client.request.HttpRequestBuilder.applyAuth() {
        val cookie = config.getSessionCookieHeader()?.trim().orEmpty()
        if (cookie.isNotEmpty()) {
            header(io.ktor.http.HttpHeaders.Cookie, cookie)
        }
    }

    private suspend inline fun <reified T> parseOk(response: HttpResponse): T {
        if (!response.status.isSuccess()) {
            HarnessAgentHttpClient.throwApiProblem(response)
        }
        return response.body()
    }

    companion object {
        fun create(config: EngineConfig): HarnessArtifactsClient =
            create(config, HarnessAgentHttpClient.createDefaultClient())

        internal fun create(
            config: EngineConfig,
            httpClient: HttpClient,
        ): HarnessArtifactsClient = HarnessArtifactsClient(config, httpClient)
    }
}
