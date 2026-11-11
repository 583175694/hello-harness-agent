package com.harness.mobile.core.data

import com.harness.mobile.core.api.RunStreamEvent
import io.ktor.client.HttpClient

internal actual suspend fun openRunEventStream(
    httpClient: HttpClient,
    url: String,
    lastEventId: Int?,
    cookie: String?,
    onEvent: suspend (RunStreamEvent) -> Unit,
) = openRunEventStreamWithKtor(httpClient, url, lastEventId, cookie, onEvent)
