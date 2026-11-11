package com.harness.mobile.core.data

import com.harness.mobile.core.api.ArtifactDownloadContent
import com.harness.mobile.core.api.ArtifactPreviewContent
import com.harness.mobile.core.api.EngineConfig
import com.harness.mobile.core.api.RestoreArtifactRequest
import com.harness.mobile.core.api.RestoreArtifactResult
import io.ktor.client.HttpClient
import io.ktor.client.call.body
import io.ktor.client.request.get
import io.ktor.client.request.header
import io.ktor.client.request.post
import io.ktor.client.request.setBody
import io.ktor.client.statement.HttpResponse
import io.ktor.http.ContentType
import io.ktor.http.HttpHeaders
import io.ktor.http.contentType
import io.ktor.http.isSuccess
import io.ktor.client.statement.bodyAsBytes

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

    suspend fun artifactPreviewUrl(artifactId: String): String {
        val base = HarnessAgentHttpClient.normalizeBaseUrl(config.apiBaseUrlProvider())
        return "$base/api/agent/artifacts/$artifactId/preview"
    }

    suspend fun filePreviewUrl(fileId: String): String {
        val base = HarnessAgentHttpClient.normalizeBaseUrl(config.apiBaseUrlProvider())
        return "$base/api/agent/files/$fileId/preview"
    }

    suspend fun previewArtifact(artifactId: String): ArtifactPreviewContent {
        val base = HarnessAgentHttpClient.normalizeBaseUrl(config.apiBaseUrlProvider())
        val response =
            httpClient.get("$base/api/agent/artifacts/$artifactId/preview") {
                applyAuth()
            }
        if (!response.status.isSuccess()) HarnessAgentHttpClient.throwApiProblem(response)
        return previewContent(response)
    }

    suspend fun downloadArtifact(artifactId: String): ArtifactDownloadContent {
        val base = HarnessAgentHttpClient.normalizeBaseUrl(config.apiBaseUrlProvider())
        val response =
            httpClient.get("$base/api/agent/artifacts/$artifactId/download") {
                applyAuth()
            }
        if (!response.status.isSuccess()) HarnessAgentHttpClient.throwApiProblem(response)
        return downloadContent(response)
    }

    suspend fun previewFile(fileId: String): ArtifactPreviewContent {
        val base = HarnessAgentHttpClient.normalizeBaseUrl(config.apiBaseUrlProvider())
        val response =
            httpClient.get("$base/api/agent/files/$fileId/preview") {
                applyAuth()
            }
        if (!response.status.isSuccess()) HarnessAgentHttpClient.throwApiProblem(response)
        return previewContent(response)
    }

    suspend fun downloadFile(fileId: String): ArtifactDownloadContent {
        val base = HarnessAgentHttpClient.normalizeBaseUrl(config.apiBaseUrlProvider())
        val response =
            httpClient.get("$base/api/agent/files/$fileId/content/original") {
                applyAuth()
            }
        if (!response.status.isSuccess()) HarnessAgentHttpClient.throwApiProblem(response)
        return downloadContent(response)
    }

    private suspend fun previewContent(response: HttpResponse): ArtifactPreviewContent {
        val contentType = response.headers[HttpHeaders.ContentType] ?: "application/octet-stream"
        val bytes = response.bodyAsBytes()
        val binary = !contentType.startsWith("text/", ignoreCase = true) &&
            !contentType.contains("json", ignoreCase = true)
        return ArtifactPreviewContent(
            bytes = bytes,
            contentType = contentType,
            fileName = response.fileNameHeader() ?: "",
            binary = binary,
        )
    }

    private suspend fun downloadContent(response: HttpResponse): ArtifactDownloadContent =
        ArtifactDownloadContent(
            bytes = response.bodyAsBytes(),
            contentType = response.headers[HttpHeaders.ContentType] ?: "application/octet-stream",
            fileName = response.fileNameHeader() ?: "download",
        )

    private fun HttpResponse.fileNameHeader(): String? {
        val disposition = headers[HttpHeaders.ContentDisposition] ?: return null
        val encoded = Regex("filename\\*=UTF-8''([^;]+)", RegexOption.IGNORE_CASE).find(disposition)?.groupValues?.getOrNull(1)
        if (encoded != null) return decodeURLPart(encoded)
        return Regex("filename=\"([^\"]+)\"").find(disposition)?.groupValues?.getOrNull(1)
    }

    private fun decodeURLPart(value: String): String =
        runCatching {
            value.replace("+", "%20").split('%').let { parts ->
                if (parts.size == 1) value
                else parts.drop(1).fold(parts.first()) { acc, part ->
                    val hex = part.take(2)
                    val rest = part.drop(2)
                    acc + hex.toInt(16).toChar() + rest
                }
            }
        }.getOrDefault(value)

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
