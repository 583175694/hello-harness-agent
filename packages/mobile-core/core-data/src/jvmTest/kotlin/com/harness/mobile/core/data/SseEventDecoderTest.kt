package com.harness.mobile.core.data

import io.ktor.utils.io.ByteChannel
import io.ktor.utils.io.close
import io.ktor.utils.io.writeFully
import kotlinx.coroutines.launch
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.yield
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class SseEventDecoderTest {
    @Test
    fun threeChunksDeliverBeforeTheThirdWrite() = runBlocking {
        val channel = ByteChannel(autoFlush = true)
        val seen = mutableListOf<Int>()
        val reader =
            launch {
                channel.collectSseEvents { event ->
                    seen += event.seq
                }
            }
        channel.writeFully(frame(1, "a").encodeToByteArray())
        while (seen.size < 1) yield()
        channel.writeFully(frame(2, "b").encodeToByteArray())
        while (seen.size < 2) yield()
        val seenBeforeThird = seen.toList()
        channel.writeFully(frame(3, "c").encodeToByteArray())
        channel.close()
        reader.join()
        assertEquals(listOf(1, 2), seenBeforeThird)
        assertEquals(listOf(1, 2, 3), seen)
    }

    @Test
    fun twoFramesInOneChunkBothEmit() = runBlocking {
        val channel = ByteChannel(autoFlush = true)
        val types = mutableListOf<String>()
        val reader =
            launch {
                channel.collectSseEvents { event ->
                    types += event.type
                }
            }
        channel.writeFully((frame(1, "a") + frame(2, "b")).encodeToByteArray())
        channel.close()
        reader.join()
        assertEquals(listOf("reasoning.delta", "reasoning.delta"), types)
    }

    @Test
    fun partialFrameWaitsForTheRemainder() = runBlocking {
        val channel = ByteChannel(autoFlush = true)
        val deltas = mutableListOf<String>()
        val reader =
            launch {
                channel.collectSseEvents { event ->
                    deltas += event.payload.toString()
                }
            }
        val bytes = frame(1, "hello").encodeToByteArray()
        channel.writeFully(bytes.copyOf(12))
        yield()
        assertTrue(deltas.isEmpty())
        channel.writeFully(bytes.copyOfRange(12, bytes.size))
        channel.close()
        reader.join()
        assertEquals(1, deltas.size)
        assertTrue(deltas.single().contains("hello"))
    }

    private fun frame(seq: Int, delta: String): String =
        "id: $seq\nevent: reasoning.delta\ndata: {\"seq\":$seq,\"sessionId\":\"s\",\"runId\":\"r\",\"type\":\"reasoning.delta\",\"payload\":{\"delta\":\"$delta\",\"blockId\":\"b\"}}\n\n"
}
