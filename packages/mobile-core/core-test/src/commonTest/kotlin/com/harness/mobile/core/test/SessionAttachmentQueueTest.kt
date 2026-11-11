package com.harness.mobile.core.test

import com.harness.mobile.core.api.FileRef
import com.harness.mobile.core.engine.SessionAttachmentQueue
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class SessionAttachmentQueueTest {
    private fun file(id: String) =
        FileRef(
            fileId = id,
            fileName = "$id.txt",
            mediaType = "text/plain",
            size = 1,
            status = "ready",
        )

    @Test
    fun attachmentsAreIsolatedBySession() {
        val queue = SessionAttachmentQueue()
        queue.add("s1", file("a"))
        queue.add("s2", file("b"))

        assertEquals(listOf("a"), queue.fileIds("s1"))
        assertEquals(listOf("b"), queue.fileIds("s2"))
    }

    @Test
    fun removeByFileIdClearsEveryBucket() {
        val queue = SessionAttachmentQueue()
        queue.add("s1", file("a"))
        queue.add("s2", file("a"))

        queue.remove("a")

        assertTrue(queue.fileIds("s1").isEmpty())
        assertTrue(queue.fileIds("s2").isEmpty())
    }

    @Test
    fun addDeduplicatesWithinSession() {
        val queue = SessionAttachmentQueue()
        queue.add("s1", file("a"))
        queue.add("s1", file("a"))

        assertEquals(listOf("a"), queue.fileIds("s1"))
    }

    @Test
    fun clearingOneSessionLeavesOthersIntact() {
        val queue = SessionAttachmentQueue()
        queue.add("s1", file("a"))
        queue.add("s2", file("b"))

        queue.clear("s1")

        assertTrue(queue.fileIds("s1").isEmpty())
        assertEquals(listOf("b"), queue.fileIds("s2"))
    }

    @Test
    fun submitReadsOnlyCurrentSessionAttachments() {
        val queue = SessionAttachmentQueue()
        queue.add("s1", file("a"))
        queue.add("s2", file("b"))

        queue.clear("s1")
        queue.add("s2", file("c"))

        assertEquals(listOf("b", "c"), queue.fileIds("s2"))
        assertTrue(queue.fileIds("s1").isEmpty())
    }
}
