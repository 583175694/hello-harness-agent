package com.harness.mobile.core.test

import com.harness.mobile.core.api.SessionDetailResponse
import com.harness.mobile.core.engine.WorkbenchArtifactProjector
import kotlinx.serialization.json.Json
import kotlin.test.Test
import kotlin.test.assertEquals

class SessionDetailArtifactSeriesTest {
    private val json = Json { ignoreUnknownKeys = true }

    @Test
    fun sessionDetailResponseParsesArtifactSeries() {
        val payload =
            """
            {
              "session": {
                "id": "sess-1",
                "title": "Artifact session",
                "status": "active",
                "isPinned": false,
                "createdAt": "2026-01-01T00:00:00Z",
                "updatedAt": "2026-01-02T00:00:00Z",
                "messages": [],
                "artifactSeries": [
                  {
                    "seriesId": "series-1",
                    "sessionId": "sess-1",
                    "logicalName": "README.md",
                    "currentArtifactId": "art-v3",
                    "createdAt": "2026-01-01T00:00:00Z",
                    "updatedAt": "2026-01-02T00:00:00Z",
                    "versions": [
                      {
                        "artifactId": "art-v2",
                        "fileId": "f2",
                        "fileName": "README.md",
                        "mediaType": "text/markdown",
                        "fileKind": "markdown",
                        "size": 12,
                        "status": "ready",
                        "createdAt": "2026-01-01T00:00:00Z",
                        "versionNumber": 2
                      },
                      {
                        "artifactId": "art-v3",
                        "fileId": "f3",
                        "fileName": "README.md",
                        "mediaType": "text/markdown",
                        "fileKind": "markdown",
                        "size": 14,
                        "status": "ready",
                        "createdAt": "2026-01-02T00:00:00Z",
                        "versionNumber": 3
                      }
                    ]
                  }
                ]
              }
            }
            """.trimIndent()
        val detail = json.decodeFromString<SessionDetailResponse>(payload).session
        assertEquals(1, detail.artifactSeries.size)
        val wb = WorkbenchArtifactProjector.applySeries(com.harness.mobile.core.api.MobileWorkbenchSnapshot(), detail.artifactSeries)
        assertEquals(2, wb.artifactVersions.size)
        assertEquals("art-v3", wb.artifactVersions.last().id)
    }
}
