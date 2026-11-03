package com.harness.mobile.core.data

/**
 * Incremental SSE framing, same boundary as Web `buffer.split('\n\n')`.
 * Bytes stay buffered until a full frame so UTF-8 is not split mid-codepoint.
 */
internal class SseFrameBuffer {
    private var pending = ByteArray(0)

    fun append(chunk: ByteArray, length: Int = chunk.size): List<String> {
        if (length <= 0) return emptyList()
        val merged = ByteArray(pending.size + length)
        pending.copyInto(merged)
        chunk.copyInto(merged, destinationOffset = pending.size, endIndex = length)
        pending = merged
        val frames = mutableListOf<String>()
        while (true) {
            val separator = findSeparator(pending) ?: break
            val frame = pending.copyOfRange(0, separator.index).decodeToString()
            pending = pending.copyOfRange(separator.index + separator.length, pending.size)
            extractDataPayload(frame)?.let { frames += it }
        }
        return frames
    }

    private data class Separator(
        val index: Int,
        val length: Int,
    )

    private fun findSeparator(bytes: ByteArray): Separator? {
        var index = 0
        while (index < bytes.size - 1) {
            if (
                index + 3 < bytes.size &&
                bytes[index] == CR &&
                bytes[index + 1] == LF &&
                bytes[index + 2] == CR &&
                bytes[index + 3] == LF
            ) {
                return Separator(index, 4)
            }
            if (bytes[index] == LF && bytes[index + 1] == LF) {
                return Separator(index, 2)
            }
            index++
        }
        return null
    }

    private companion object {
        val LF = '\n'.code.toByte()
        val CR = '\r'.code.toByte()
    }
}

/** `data:` lines of one SSE frame. Comments and heartbeats return null. */
internal fun extractDataPayload(frame: String): String? {
    val dataLines =
        frame
            .lineSequence()
            .filter { it.startsWith("data:") }
            .map { it.removePrefix("data:").trimStart() }
            .toList()
    if (dataLines.isEmpty()) return null
    return dataLines.joinToString("\n")
}
