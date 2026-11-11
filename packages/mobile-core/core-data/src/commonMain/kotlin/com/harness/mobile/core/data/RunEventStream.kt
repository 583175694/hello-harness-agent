package com.harness.mobile.core.data

import com.harness.mobile.core.api.RunStreamEvent
import io.ktor.client.HttpClient

/**
 * Platform SSE body reader.
 * Android uses OkHttp's streaming source so frames are not held until the run ends.
 */
internal expect suspend fun openRunEventStream(
    httpClient: HttpClient,
    url: String,
    lastEventId: Int?,
    cookie: String?,
    onEvent: suspend (RunStreamEvent) -> Unit,
)
