package com.harness.mobile.core.data

import com.harness.mobile.core.api.RunStreamEvent
import io.ktor.utils.io.ByteReadChannel
import io.ktor.utils.io.readAvailable
import kotlinx.serialization.json.Json

internal val sseEventJson: Json = Json { ignoreUnknownKeys = true; isLenient = true }

/** Read a streaming body in chunks and invoke [onEvent] as soon as each frame completes. */
internal suspend fun ByteReadChannel.collectSseEvents(onEvent: suspend (RunStreamEvent) -> Unit) {
    val assembler = SseFrameBuffer()
    val buffer = ByteArray(8 * 1024)
    while (!isClosedForRead) {
        val count = readAvailable(buffer)
        when {
            count == -1 -> break
            count == 0 -> if (!awaitContent()) break
            else -> {
                for (payload in assembler.append(buffer, count)) {
                    onEvent(sseEventJson.decodeFromString(RunStreamEvent.serializer(), payload))
                }
            }
        }
    }
}
