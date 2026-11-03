package com.harness.mobile.core.data

import com.harness.mobile.core.api.RunStreamEvent
import io.ktor.client.HttpClient
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.isActive
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import okhttp3.Request
import okio.Buffer
import java.util.concurrent.TimeUnit
import kotlin.coroutines.coroutineContext

/**
 * OkHttp [okio.BufferedSource.read] delivers bytes as the server flushes them.
 * Ktor's Android channel has been holding the SSE body until the run finished.
 */
private val streamingCallClient: OkHttpClient =
    OkHttpClient.Builder()
        .retryOnConnectionFailure(true)
        .cache(null)
        .connectTimeout(60, TimeUnit.SECONDS)
        .readTimeout(0, TimeUnit.MILLISECONDS)
        .writeTimeout(60, TimeUnit.SECONDS)
        .callTimeout(0, TimeUnit.MILLISECONDS)
        .build()

@Suppress("UNUSED_PARAMETER")
internal actual suspend fun openRunEventStream(
    httpClient: HttpClient,
    url: String,
    lastEventId: Int?,
    cookie: String?,
    onEvent: suspend (RunStreamEvent) -> Unit,
) {
    withContext(Dispatchers.IO) {
        val request =
            Request.Builder()
                .url(url)
                .header("Accept", "text/event-stream")
                .header("Accept-Encoding", "identity")
                .header("Cache-Control", "no-cache")
                .apply {
                    if (lastEventId != null) header("Last-Event-ID", lastEventId.toString())
                    if (!cookie.isNullOrBlank()) header("Cookie", cookie)
                }
                .build()
        streamingCallClient.newCall(request).execute().use { response ->
            if (!response.isSuccessful) {
                val bytes = response.body?.bytes() ?: byteArrayOf()
                HarnessAgentHttpClient.throwApiProblemFromHttp(response.code, bytes)
            }
            val source = response.body?.source() ?: error("SSE body missing")
            source.timeout().clearTimeout()
            val assembler = SseFrameBuffer()
            val bucket = Buffer()
            while (coroutineContext.isActive) {
                val read = source.read(bucket, 8 * 1024)
                if (read == -1L) break
                val bytes = bucket.readByteArray()
                for (payload in assembler.append(bytes)) {
                    onEvent(sseEventJson.decodeFromString(RunStreamEvent.serializer(), payload))
                }
            }
        }
    }
}
