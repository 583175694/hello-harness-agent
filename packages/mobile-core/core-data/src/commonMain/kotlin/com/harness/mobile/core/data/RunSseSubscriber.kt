package com.harness.mobile.core.data

import com.harness.mobile.core.api.EngineConfig
import com.harness.mobile.core.api.RunStreamEvent
import io.ktor.client.HttpClient

class RunSseSubscriber(
    private val config: EngineConfig,
    private val httpClient: HttpClient,
) {
    suspend fun subscribeRun(
        runId: String,
        lastEventId: Int?,
        onEvent: suspend (RunStreamEvent) -> Unit,
    ) {
        val base = HarnessAgentHttpClient.normalizeBaseUrl(config.apiBaseUrlProvider())
        val cookie = config.getSessionCookieHeader()?.trim().orEmpty().ifBlank { null }
        openRunEventStream(
            httpClient = httpClient,
            url = "$base/api/agent/runs/$runId/events",
            lastEventId = lastEventId,
            cookie = cookie,
            onEvent = onEvent,
        )
    }

    companion object {
        fun create(config: EngineConfig): RunSseSubscriber =
            RunSseSubscriber(config, StreamingHttpClient.create())
    }
}
