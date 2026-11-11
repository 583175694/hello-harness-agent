package com.harness.mobile.core.data

import io.ktor.client.HttpClientConfig
import io.ktor.client.engine.HttpClientEngine
import io.ktor.client.engine.okhttp.OkHttp
import java.util.concurrent.TimeUnit

internal actual fun createStreamingHttpEngine(): HttpClientEngine =
    OkHttp.create {
        config {
            retryOnConnectionFailure(true)
            connectTimeout(60, TimeUnit.SECONDS)
            readTimeout(0, TimeUnit.MILLISECONDS)
            writeTimeout(60, TimeUnit.SECONDS)
            callTimeout(0, TimeUnit.MILLISECONDS)
        }
    }

internal actual fun HttpClientConfig<*>.configureStreamingHttpClient() {
    // OkHttp engine only; SSE must not wait for full gzip body.
}
