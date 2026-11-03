package com.harness.mobile.core.data

import com.harness.mobile.core.api.ApiProblem
import com.harness.mobile.core.api.EngineConfig
import com.harness.mobile.core.api.ProblemDetails
import com.harness.mobile.core.api.PublicAgentConfig
import com.harness.mobile.core.api.ServiceStatus
import io.ktor.client.HttpClient
import io.ktor.client.call.body
import io.ktor.client.plugins.contentnegotiation.ContentNegotiation
import io.ktor.client.request.get
import io.ktor.client.request.header
import io.ktor.client.statement.HttpResponse
import io.ktor.http.isSuccess
import io.ktor.serialization.kotlinx.json.json
import kotlinx.serialization.json.Json

class HarnessAgentHttpClient internal constructor(
    private val config: EngineConfig,
    private val httpClient: HttpClient,
) {
    private val json =
        Json {
            ignoreUnknownKeys = true
            isLenient = true
        }

    suspend fun getReadiness(): ServiceStatus {
        val base = normalizeBaseUrl(config.apiBaseUrlProvider())
        val response = httpClient.get("$base/readyz") {
            applyAuth()
        }
        return parseOk(response)
    }

    suspend fun getPublicAgentConfig(): PublicAgentConfig {
        val base = normalizeBaseUrl(config.apiBaseUrlProvider())
        val response = httpClient.get("$base/api/agent/config/public") {
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
        throwApiProblem(response)
    }

    companion object {
        internal suspend fun throwApiProblem(response: HttpResponse): Nothing {
            val problem: ProblemDetails =
                runCatching { response.body<ProblemDetails>() }
                    .getOrElse {
                        ProblemDetails(
                            type = "about:blank",
                            title = "Request failed",
                            status = response.status.value,
                            code = "HTTP_${response.status.value}",
                            detail = response.status.description,
                        )
                    }
            throw ApiProblem(problem)
        }

        internal fun throwApiProblemFromHttp(statusCode: Int, bodyBytes: ByteArray): Nothing {
            val problem: ProblemDetails =
                runCatching {
                    defaultJson.decodeFromString(ProblemDetails.serializer(), bodyBytes.decodeToString())
                }.getOrElse {
                    ProblemDetails(
                        type = "about:blank",
                        title = "Request failed",
                        status = statusCode,
                        code = "HTTP_$statusCode",
                        detail = bodyBytes.decodeToString().ifBlank { "HTTP $statusCode" },
                    )
                }
            throw ApiProblem(problem)
        }

        private val defaultJson =
            Json {
                ignoreUnknownKeys = true
            }

        fun create(config: EngineConfig): HarnessAgentHttpClient =
            HarnessAgentHttpClient(config, createDefaultClient())

        fun normalizeBaseUrl(raw: String): String {
            val trimmed = raw.trim().removeSuffix("/")
            require(trimmed.isNotEmpty()) { "apiBaseUrl is empty" }
            require(trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
                "apiBaseUrl must start with http:// or https://"
            }
            return trimmed
        }

        fun createDefaultClient(): HttpClient =
            HttpClient(createPlatformHttpEngine()) {
                install(ContentNegotiation) {
                    json(
                        Json {
                            ignoreUnknownKeys = true
                            isLenient = true
                            // 不可全局 encodeDefaults：会写出 skillNames/attachmentIds: null，createRun 协议校验失败。
                            // RunControl 的 type 字段用 @EncodeDefault(ALWAYS) 单独保证。
                        },
                    )
                }
            }
    }
}
