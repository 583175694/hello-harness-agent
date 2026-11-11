package com.harness.mobile.core.engine

import kotlin.random.Random

internal fun randomClientId(): String {
    val bytes = ByteArray(16)
    Random.nextBytes(bytes)
    return buildString(32) {
        bytes.forEach { b ->
            val v = b.toInt() and 0xff
            append(HEX[v shr 4])
            append(HEX[v and 0x0f])
        }
    }
}

private val HEX = charArrayOf('0', '1', '2', '3', '4', '5', '6', '7', '8', '9', 'a', 'b', 'c', 'd', 'e', 'f')
