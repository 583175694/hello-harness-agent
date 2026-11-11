package com.harness.mobile.core.test

import com.harness.mobile.core.api.ArtifactPreviewCapability
import com.harness.mobile.core.api.ArtifactPreviewMode
import com.harness.mobile.core.api.ArtifactRef
import kotlin.test.Test
import kotlin.test.assertEquals

class ArtifactPreviewCapabilityTest {
    @Test
    fun htmlUsesRemoteUrl() {
        val mode =
            ArtifactPreviewCapability.resolve(
                ArtifactRef(artifactId = "1", fileId = "f", fileName = "a.html", fileKind = "html", mediaType = "text/html"),
            )
        assertEquals(ArtifactPreviewMode.RemoteAuthenticatedUrl, mode)
    }

    @Test
    fun docxNormalizedText() {
        val mode = ArtifactPreviewCapability.resolve("docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "a.docx")
        assertEquals(ArtifactPreviewMode.InlineText, mode)
    }
}
