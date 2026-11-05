package com.harness.agent.reader

import com.harness.agent.model.ArtifactPreviewPayload
import com.harness.agent.model.ReaderTarget
import com.harness.agent.ui.reader.ReaderContentState
import com.harness.agent.ui.reader.readerMessage
import com.harness.agent.ui.reader.toReaderState
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class ReaderStateMappingTest {
    private val target =
        ReaderTarget(
            artifactId = "a1",
            fileId = "f1",
            fileName = "file",
            mediaType = "text/markdown",
            fileKind = "markdown",
        )

    @Test
    fun markdownIsRenderedAsText() {
        val state =
            ArtifactPreviewPayload(
                bytes = "# hi".toByteArray(),
                contentType = "text/markdown; charset=utf-8",
                fileName = "a.md",
                binary = false,
            ).toReaderState(target)
        assertTrue(state is ReaderContentState.Text)
    }

    @Test
    fun htmlIsUnsupportedInsteadOfMarkdown() {
        val state =
            ArtifactPreviewPayload(
                bytes = "<html><body>hi</body></html>".toByteArray(),
                contentType = "text/html; charset=utf-8",
                fileName = "a.html",
                binary = false,
            ).toReaderState(target.copy(fileKind = "html"))
        assertTrue(state is ReaderContentState.Unsupported)
    }

    @Test
    fun emptyBytesIsEmptyState() {
        val state =
            ArtifactPreviewPayload(
                bytes = ByteArray(0),
                contentType = "text/markdown",
                fileName = "a.md",
                binary = false,
            ).toReaderState(target)
        assertTrue(state is ReaderContentState.Empty)
    }

    @Test
    fun problemMessagesMapToExplicitChineseStates() {
        assertEquals("文件不存在或已被删除。", IllegalStateException("HTTP 404 NOT_FOUND: 产物不存在。").readerMessage())
        assertEquals("文件不存在或已被删除。", IllegalStateException("HTTP 400 BAD_REQUEST: ARTIFACT_DELETED").readerMessage())
        assertEquals("登录已失效，请重新登录。", IllegalStateException("HTTP 401 AUTH_REQUIRED").readerMessage())
        assertEquals("网络连接失败，请重试。", IllegalStateException("Connection refused").readerMessage())
    }
}
