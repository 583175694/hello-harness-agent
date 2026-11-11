package com.harness.mobile.core.data

import com.harness.mobile.core.api.RunStreamEvent
import io.ktor.client.HttpClient
import io.ktor.client.request.get
import io.ktor.client.request.header
import io.ktor.client.statement.bodyAsChannel
import io.ktor.http.HttpHeaders
import io.ktor.http.isSuccess

internal suspend fun openRunEventStreamWithKtor(
    httpClient: HttpClient,
    url: String,
    lastEventId: Int?,
    cookie: String?,
    onEvent: suspend (RunStreamEvent) -> Unit,
) {
    val response =
        httpClient.get(url) {
            header(HttpHeaders.Accept, "text/event-stream")
            header(HttpHeaders.AcceptEncoding, "identity")
            header(HttpHeaders.CacheControl, "no-cache")
            if (lastEventId != null) {
                header("Last-Event-ID", lastEventId.toString())
            }
            if (!cookie.isNullOrBlank()) {
                header(HttpHeaders.Cookie, cookie)
            }
        }
    if (!response.status.isSuccess()) {
        HarnessAgentHttpClient.throwApiProblem(response)
    }
    response.bodyAsChannel().collectSseEvents(onEvent)
}
