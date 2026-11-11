package com.harness.mobile.core.data

import io.ktor.client.HttpClientConfig
import io.ktor.client.engine.HttpClientEngine
import io.ktor.client.engine.cio.CIO

internal actual fun createStreamingHttpEngine(): HttpClientEngine = CIO.create()

internal actual fun HttpClientConfig<*>.configureStreamingHttpClient() {
    // CIO streams SSE in tests.
}
