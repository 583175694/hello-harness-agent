package com.harness.mobile.core.data

import com.harness.mobile.core.api.ApiProblem
import com.harness.mobile.core.api.AuthLoginResponse
import com.harness.mobile.core.api.AuthVerifyResult
import com.harness.mobile.core.api.EngineConfig
import com.harness.mobile.core.api.ProblemDetails
import com.harness.mobile.core.auth.SessionCookie
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

class HarnessAuthClient internal constructor(
    private val config: EngineConfig,
    private val httpClient: HttpClient,
) {
    suspend fun sendPhoneCode(phone: String) {
        val base = HarnessAgentHttpClient.normalizeBaseUrl(config.apiBaseUrlProvider())
        val response =
            httpClient.post("$base/api/auth/phone/send-code") {
                contentType(ContentType.Application.Json)
                setBody(SendPhoneCodeBody(phone = phone.trim()))
                applyAuth()
            }
        if (!response.status.isSuccess()) {
            throwApiProblem(response)
        }
    }

    suspend fun verifyPhone(
        phone: String,
        code: String,
    ): AuthVerifyResult {
        val base = HarnessAgentHttpClient.normalizeBaseUrl(config.apiBaseUrlProvider())
        val response =
            httpClient.post("$base/api/auth/phone/verify") {
                contentType(ContentType.Application.Json)
                setBody(VerifyPhoneBody(phone = phone.trim(), code = code.trim()))
                applyAuth()
            }
        if (!response.status.isSuccess()) {
            throwApiProblem(response)
        }
        val token =
            extractSessionToken(response)
                ?: error("verify succeeded but Set-Cookie ${SessionCookie.NAME} missing")
        val body: AuthLoginResponse = response.body()
        return AuthVerifyResult(user = body.user, sessionToken = token)
    }

    suspend fun logout() {
        val base = HarnessAgentHttpClient.normalizeBaseUrl(config.apiBaseUrlProvider())
        val response =
            httpClient.post("$base/api/auth/logout") {
                applyAuth()
            }
        if (!response.status.isSuccess()) {
            throwApiProblem(response)
        }
    }

    private suspend fun io.ktor.client.request.HttpRequestBuilder.applyAuth() {
        val cookie = config.getSessionCookieHeader()?.trim().orEmpty()
        if (cookie.isNotEmpty()) {
            header("Cookie", cookie)
        }
    }

    private suspend fun throwApiProblem(response: HttpResponse): Nothing {
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

    private fun extractSessionToken(response: HttpResponse): String? {
        val lines = response.headers.getAll("Set-Cookie") ?: return null
        val pattern = Regex("""${SessionCookie.NAME}=([^;]+)""")
        for (line in lines) {
            val match = pattern.find(line) ?: continue
            return match.groupValues[1]
        }
        return null
    }

    companion object {
        fun create(config: EngineConfig): HarnessAuthClient =
            HarnessAuthClient(config, HarnessAgentHttpClient.createDefaultClient())
    }

    @Serializable
    private data class SendPhoneCodeBody(val phone: String)

    @Serializable
    private data class VerifyPhoneBody(
        val phone: String,
        val code: String,
    )
}
