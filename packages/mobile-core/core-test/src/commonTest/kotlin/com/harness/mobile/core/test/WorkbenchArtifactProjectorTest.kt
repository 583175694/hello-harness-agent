package com.harness.mobile.core.test

import com.harness.mobile.core.api.ArtifactRef
import com.harness.mobile.core.api.ArtifactSeriesRef
import com.harness.mobile.core.api.MobileWorkbenchSnapshot
import com.harness.mobile.core.engine.WorkbenchArtifactProjector
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class WorkbenchArtifactProjectorTest {
    @Test
    fun applySeriesBuildsVersionRowsWithCurrentSelected() {
        val series =
            listOf(
                ArtifactSeriesRef(
                    seriesId = "series-1",
                    sessionId = "sess-1",
                    logicalName = "README.md",
                    currentArtifactId = "art-v3",
                    versions =
                        listOf(
                            ArtifactRef(
                                artifactId = "art-v2",
                                fileId = "f2",
                                fileName = "README.md",
                                versionNumber = 2,
                            ),
                            ArtifactRef(
                                artifactId = "art-v3",
                                fileId = "f3",
                                fileName = "README.md",
                                versionNumber = 3,
                            ),
                        ),
                ),
            )
        val wb = WorkbenchArtifactProjector.applySeries(MobileWorkbenchSnapshot(), series)
        assertEquals(2, wb.artifactVersions.size)
        assertEquals("art-v3", wb.artifactVersions.last().id)
        assertTrue(wb.artifactVersions.last().selected)
        assertEquals(1, wb.deliverableFiles.size)
        assertEquals("art-v3", wb.deliverableFiles.single().artifactId)
        assertEquals("series-1", wb.deliverableFiles.single().seriesId)
        assertEquals(true, wb.deliverableFiles.single().isCurrent)
        assertTrue(wb.artifactRestorePrompt?.contains("README.md") == true)
        val v2 = wb.artifactVersions.first()
        assertEquals("series-1", v2.seriesId)
        assertEquals("art-v3", v2.expectedCurrentArtifactId)
    }

    @Test
    fun staleMetadataIsCurrentDoesNotOverrideSeriesCurrent() {
        val series =
            listOf(
                ArtifactSeriesRef(
                    seriesId = "series-1",
                    sessionId = "sess-1",
                    logicalName = "README.md",
                    currentArtifactId = "art-v3",
                    versions =
                        listOf(
                            ArtifactRef(
                                artifactId = "art-v2",
                                fileId = "f2",
                                fileName = "README.md",
                                versionNumber = 2,
                                isCurrent = true,
                            ),
                            ArtifactRef(
                                artifactId = "art-v3",
                                fileId = "f3",
                                fileName = "README.md",
                                versionNumber = 3,
                            ),
                        ),
                ),
            )
        val wb = WorkbenchArtifactProjector.applySeries(MobileWorkbenchSnapshot(), series)
        assertEquals(1, wb.artifactVersions.count { it.selected })
        assertEquals("art-v3", wb.artifactVersions.single { it.selected }.id)
    }

    @Test
    fun metadataIsCurrentFallbackSelectsSingleVersion() {
        val series =
            listOf(
                ArtifactSeriesRef(
                    seriesId = "series-1",
                    sessionId = "sess-1",
                    logicalName = "README.md",
                    currentArtifactId = null,
                    versions =
                        listOf(
                            ArtifactRef("art-v1", "f1", "README.md", versionNumber = 1, isCurrent = true),
                            ArtifactRef("art-v2", "f2", "README.md", versionNumber = 2, isCurrent = true),
                        ),
                ),
            )
        val wb = WorkbenchArtifactProjector.applySeries(MobileWorkbenchSnapshot(), series)
        assertEquals(1, wb.artifactVersions.count { it.selected })
        assertEquals("art-v2", wb.artifactVersions.single { it.selected }.id)
    }
}
