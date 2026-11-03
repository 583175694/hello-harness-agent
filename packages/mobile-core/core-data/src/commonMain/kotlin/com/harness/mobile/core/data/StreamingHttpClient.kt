package com.harness.mobile.core.data

import io.ktor.client.HttpClient
import io.ktor.client.plugins.HttpTimeout
import io.ktor.client.engine.HttpClientEngine

/** Long-lived SSE connections; separate from JSON API client (no gzip buffering). */
internal object StreamingHttpClient {
    fun create(): HttpClient =
        HttpClient(createStreamingHttpEngine()) {
            expectSuccess = false
            install(HttpTimeout) {
                connectTimeoutMillis = 60_000
                socketTimeoutMillis = Long.MAX_VALUE
                requestTimeoutMillis = Long.MAX_VALUE
            }
            configureStreamingHttpClient()
        }
}

internal expect fun createStreamingHttpEngine(): HttpClientEngine

internal expect fun io.ktor.client.HttpClientConfig<*>.configureStreamingHttpClient()
