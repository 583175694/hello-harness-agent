package com.harness.agent.media

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class FilePreviewUrlsTest {
    @Test
    fun resolvesRelativePreviewWithApiBase() {
        val url =
            normalizePreviewUri(
                apiBaseUrl = "https://agent.example.com",
                preview = "/api/agent/files/f1/preview",
                fileId = "f1",
            )
        assertEquals("https://agent.example.com/api/agent/files/f1/preview", url)
    }

    @Test
    fun prefersLocalPreviewOverServerPath() {
        val url =
            resolveAttachmentPreviewUri(
                apiBaseUrl = "https://agent.example.com",
                fileId = "f1",
                serverPreviewUrl = "/api/agent/files/f1/preview",
                localPreviewUri = "content://media/photo/1",
            )
        assertEquals("content://media/photo/1", url)
    }

    @Test
    fun buildsPreviewFromFileIdWhenServerOmitsUrl() {
        val url =
            resolveAttachmentPreviewUri(
                apiBaseUrl = "https://agent.example.com/",
                fileId = "abc",
                serverPreviewUrl = null,
                localPreviewUri = null,
            )
        assertEquals("https://agent.example.com/api/agent/files/abc/preview", url)
    }

    @Test
    fun detectsLocalUris() {
        assertTrue(isLocalPreviewUri("content://x"))
        assertTrue(isLocalPreviewUri("file:///tmp/x.jpg"))
    }
}
