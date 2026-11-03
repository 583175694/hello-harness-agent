package com.harness.mobile.core.data

import com.harness.mobile.core.api.ArtifactVersionContext
import com.harness.mobile.core.api.CancelRunResponse
import com.harness.mobile.core.api.CreateRunResponse
import com.harness.mobile.core.api.EngineConfig
import com.harness.mobile.core.api.RunControlApproveCommand
import com.harness.mobile.core.api.RunControlRejectCommand
import com.harness.mobile.core.api.RunControlRespondCommand
import com.harness.mobile.core.api.RunControlResponse
import com.harness.mobile.core.api.RunDetailResponse
import com.harness.mobile.core.api.RunSnapshot
import io.ktor.client.HttpClient
import io.ktor.client.call.body
import io.ktor.client.request.get
import io.ktor.client.request.header
import io.ktor.client.request.post
import io.ktor.client.request.setBody
import io.ktor.client.statement.HttpResponse
import io.ktor.http.ContentType
import io.ktor.http.contentType
import io.ktor.http.isSuccess
import kotlinx.serialization.Serializable

class HarnessRunsClient internal constructor(
    private val config: EngineConfig,
    private val httpClient: HttpClient,
) {
    suspend fun createRun(
        sessionId: String,
        content: String,
        model: String,
        reasoningEffort: String,
        idempotencyKey: String,
        skillNames: List<String> = emptyList(),
        attachmentIds: List<String> = emptyList(),
        artifactVersionContext: ArtifactVersionContext? = null,
    ): CreateRunResponse {
        val base = HarnessAgentHttpClient.normalizeBaseUrl(config.apiBaseUrlProvider())
        val response =
            httpClient.post("$base/api/agent/sessions/$sessionId/runs") {
                contentType(ContentType.Application.Json)
                setBody(
                    CreateRunBody(
                        content = content,
                        model = model,
                        reasoningEffort = reasoningEffort,
                        idempotencyKey = idempotencyKey,
                        skillNames = skillNames.takeIf { it.isNotEmpty() },
                        attachmentIds = attachmentIds.takeIf { it.isNotEmpty() },
                        artifactVersionContext = artifactVersionContext,
                    ),
                )
                applyAuth()
            }
        return parseOk(response)
    }

    suspend fun getRun(runId: String): RunSnapshot {
        val base = HarnessAgentHttpClient.normalizeBaseUrl(config.apiBaseUrlProvider())
        val response =
            httpClient.get("$base/api/agent/runs/$runId") {
                applyAuth()
            }
        return parseOk(response)
    }

    suspend fun getRunDetail(runId: String): RunDetailResponse {
        val base = HarnessAgentHttpClient.normalizeBaseUrl(config.apiBaseUrlProvider())
        val response =
            httpClient.get("$base/api/agent/runs/$runId/detail") {
                applyAuth()
            }
        return parseOk(response)
    }

    suspend fun controlRun(
        runId: String,
        command: RunControlRespondCommand,
    ): RunControlResponse = postControlRun(runId, command)

    suspend fun controlRun(
        runId: String,
        command: RunControlApproveCommand,
    ): RunControlResponse = postControlRun(runId, command)

    suspend fun controlRun(
        runId: String,
        command: RunControlRejectCommand,
    ): RunControlResponse = postControlRun(runId, command)

    private suspend inline fun <reified T> postControlRun(
        runId: String,
        command: T,
    ): RunControlResponse {
        val base = HarnessAgentHttpClient.normalizeBaseUrl(config.apiBaseUrlProvider())
        val response =
            httpClient.post("$base/api/agent/runs/$runId/commands") {
                contentType(ContentType.Application.Json)
                setBody(command)
                applyAuth()
            }
        return parseOk(response)
    }

    suspend fun cancelRun(runId: String): CancelRunResponse {
        val base = HarnessAgentHttpClient.normalizeBaseUrl(config.apiBaseUrlProvider())
        val response =
            httpClient.post("$base/api/agent/runs/$runId/cancel") {
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
        fun create(config: EngineConfig): HarnessRunsClient =
            create(config, HarnessAgentHttpClient.createDefaultClient())

        internal fun create(
            config: EngineConfig,
            httpClient: HttpClient,
        ): HarnessRunsClient = HarnessRunsClient(config, httpClient)
    }

    @Serializable
    private data class CreateRunBody(
        val content: String,
        val model: String,
        val reasoningEffort: String,
        val idempotencyKey: String,
        val skillNames: List<String>? = null,
        val attachmentIds: List<String>? = null,
        val artifactVersionContext: ArtifactVersionContext? = null,
    )
}
