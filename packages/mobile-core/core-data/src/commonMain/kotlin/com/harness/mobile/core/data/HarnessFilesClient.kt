package com.harness.mobile.core.data

import com.harness.mobile.core.api.EngineConfig
import com.harness.mobile.core.api.FileRef
import io.ktor.client.HttpClient
import io.ktor.client.call.body
import io.ktor.client.request.delete
import io.ktor.client.request.forms.formData
import io.ktor.client.request.forms.submitFormWithBinaryData
import io.ktor.client.request.get
import io.ktor.client.request.header
import io.ktor.client.statement.HttpResponse
import io.ktor.http.Headers
import io.ktor.http.HttpHeaders
import io.ktor.http.isSuccess
import kotlinx.serialization.Serializable

class HarnessFilesClient internal constructor(
    private val config: EngineConfig,
    private val httpClient: HttpClient,
) {
    suspend fun uploadFile(
        sessionId: String,
        fileName: String,
        bytes: ByteArray,
        contentType: String,
    ): FileRef {
        val base = HarnessAgentHttpClient.normalizeBaseUrl(config.apiBaseUrlProvider())
        val response =
            httpClient.submitFormWithBinaryData(
                url = "$base/api/agent/sessions/$sessionId/files",
                formData =
                    formData {
                        append(
                            "file",
                            bytes,
                            Headers.build {
                                append(HttpHeaders.ContentType, contentType)
                                append(HttpHeaders.ContentDisposition, "filename=\"$fileName\"")
                            },
                        )
                    },
            ) {
                applyAuth()
            }
        return parseOk(response)
    }

    suspend fun getFile(fileId: String): FileRef {
        val base = HarnessAgentHttpClient.normalizeBaseUrl(config.apiBaseUrlProvider())
        val response =
            httpClient.get("$base/api/agent/files/$fileId") {
                applyAuth()
            }
        return parseOk(response)
    }

    suspend fun deleteFile(fileId: String): DeleteFileResponse {
        val base = HarnessAgentHttpClient.normalizeBaseUrl(config.apiBaseUrlProvider())
        val response =
            httpClient.delete("$base/api/agent/files/$fileId") {
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

    @Serializable
    data class DeleteFileResponse(
        val deletedFileId: String,
    )

    companion object {
        fun create(config: EngineConfig): HarnessFilesClient =
            HarnessFilesClient(config, HarnessAgentHttpClient.createDefaultClient())
    }
}
