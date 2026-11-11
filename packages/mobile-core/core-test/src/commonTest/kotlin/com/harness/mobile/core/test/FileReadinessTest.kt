package com.harness.mobile.core.test

import com.harness.mobile.core.api.FileRef
import com.harness.mobile.core.api.awaitFileReady
import kotlinx.coroutines.runBlocking
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith

class FileReadinessTest {
    @Test
    fun awaitFileReady_returnsWhenReady() {
        var calls = 0
        val ready =
            runBlocking {
                awaitFileReady(
                    getFile = {
                        calls++
                        FileRef(
                            fileId = it,
                            fileName = "a.txt",
                            mediaType = "text/plain",
                            size = 1,
                            status = if (calls >= 2) "ready" else "processing",
                        )
                    },
                    fileId = "f1",
                    maxAttempts = 5,
                    delayMs = 0L,
                )
            }
        assertEquals("ready", ready.status)
        assertEquals(2, calls)
    }

    @Test
    fun awaitFileReady_failsOnRejected() {
        assertFailsWith<IllegalStateException> {
            runBlocking {
                awaitFileReady(
                    getFile = {
                        FileRef(
                            fileId = it,
                            fileName = "a.txt",
                            mediaType = "text/plain",
                            size = 1,
                            status = "rejected",
                            errorCode = "TOO_LARGE",
                        )
                    },
                    fileId = "f1",
                    maxAttempts = 2,
                    delayMs = 0L,
                )
            }
        }
    }
}
