package com.harness.mobile.core.data

import com.harness.mobile.core.api.CreateRunResponse
import com.harness.mobile.core.api.EngineConfig
import com.harness.mobile.core.api.PendingUserInputView
import io.ktor.client.HttpClient
import io.ktor.client.call.body
import io.ktor.client.request.header
import io.ktor.client.request.post
import io.ktor.client.request.setBody
import io.ktor.client.statement.HttpResponse
import io.ktor.http.ContentType
import io.ktor.http.contentType
import io.ktor.http.isSuccess
import kotlinx.serialization.Serializable

class HarnessPendingInputsClient internal constructor(
    private val config: EngineConfig,
    private val httpClient: HttpClient,
) {
    /** 返回 "pending" 表示已入队；"run" 表示对端 run 已结束，调用方不得当作已送达。 */
    suspend fun submitPendingInput(
        sessionId: String,
        content: String,
        idempotencyKey: String,
    ): String {
        val base = HarnessAgentHttpClient.normalizeBaseUrl(config.apiBaseUrlProvider())
        val response =
            httpClient.post("$base/api/agent/sessions/$sessionId/pending-inputs") {
                contentType(ContentType.Application.Json)
                setBody(PendingInputBody(content = content, idempotencyKey = idempotencyKey))
                applyAuth()
            }
        if (!response.status.isSuccess()) {
            HarnessAgentHttpClient.throwApiProblem(response)
        }
        return response.body<SubmitPendingInputResponse>().kind
    }

    suspend fun sendPendingInput(inputId: String): CreateRunResponse {
        val base = HarnessAgentHttpClient.normalizeBaseUrl(config.apiBaseUrlProvider())
        val response =
            httpClient.post("$base/api/agent/pending-inputs/$inputId/send") {
                applyAuth()
            }
        return parseOk(response)
    }

    suspend fun cancelPendingInput(inputId: String) {
        val base = HarnessAgentHttpClient.normalizeBaseUrl(config.apiBaseUrlProvider())
        val response =
            httpClient.post("$base/api/agent/pending-inputs/$inputId/cancel") {
                applyAuth()
            }
        ensureOk(response)
    }

    suspend fun promotePendingInput(inputId: String): PendingUserInputView {
        val base = HarnessAgentHttpClient.normalizeBaseUrl(config.apiBaseUrlProvider())
        val response =
            httpClient.post("$base/api/agent/pending-inputs/$inputId/steer") {
                applyAuth()
            }
        return parseOk(response)
    }

    suspend fun resumePendingQueue(sessionId: String): CreateRunResponse {
        val base = HarnessAgentHttpClient.normalizeBaseUrl(config.apiBaseUrlProvider())
        val response =
            httpClient.post("$base/api/agent/sessions/$sessionId/pending-inputs/resume") {
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

    private suspend fun ensureOk(response: HttpResponse) {
        if (!response.status.isSuccess()) {
            HarnessAgentHttpClient.throwApiProblem(response)
        }
    }

    private suspend inline fun <reified T> parseOk(response: HttpResponse): T {
        if (response.status.isSuccess()) {
            return response.body()
        }
        HarnessAgentHttpClient.throwApiProblem(response)
    }

    companion object {
        fun create(config: EngineConfig): HarnessPendingInputsClient =
            HarnessPendingInputsClient(config, HarnessAgentHttpClient.createDefaultClient())
    }

    @Serializable
    private data class SubmitPendingInputResponse(
        val kind: String,
    )

    @Serializable
    private data class PendingInputBody(
        val content: String,
        val idempotencyKey: String,
    )
}
