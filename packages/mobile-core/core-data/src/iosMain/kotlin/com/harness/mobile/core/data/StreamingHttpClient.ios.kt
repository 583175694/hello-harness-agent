package com.harness.mobile.core.data

import io.ktor.client.HttpClientConfig
import io.ktor.client.engine.HttpClientEngine
import io.ktor.client.engine.darwin.Darwin
internal actual fun createStreamingHttpEngine(): HttpClientEngine =
    Darwin.create {
        configureRequest {
            setTimeoutInterval(86400.0)
            setAllowsCellularAccess(true)
        }
    }

internal actual fun HttpClientConfig<*>.configureStreamingHttpClient() {
    // Darwin streams body by default when read incrementally.
}
