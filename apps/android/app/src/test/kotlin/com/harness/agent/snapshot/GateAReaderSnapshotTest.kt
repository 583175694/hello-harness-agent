package com.harness.agent.snapshot

import app.cash.paparazzi.DeviceConfig
import app.cash.paparazzi.Paparazzi
import com.harness.agent.coreui.feedback.AppToastHost
import com.harness.agent.coreui.tokens.HarnessTheme
import com.harness.agent.preview.MobileContractPreviewLoader
import com.harness.agent.preview.PreviewAppPreferences
import com.harness.agent.model.ArtifactDownloadPayload
import com.harness.agent.model.ArtifactPreviewPayload
import com.harness.agent.model.ReaderTarget
import com.harness.agent.ui.reader.PreviewReportReaderScreen
import org.junit.Rule
import org.junit.Test

/** S-READER：Report / Artifact 全屏阅读（UI 回归 #15）。 */
class GateAReaderSnapshotTest {
    @get:Rule
    val paparazzi =
        Paparazzi(
            deviceConfig = DeviceConfig.PIXEL_5,
            theme = "android:Theme.Material.Light.NoActionBar",
        )

    private fun load(fileName: String) = MobileContractPreviewLoader(paparazzi.context).load(fileName)

    @Test
    fun reportReader_workbenchReportMarkdown() {
        val state = load("workbench-report-markdown.json")
        val prefs = PreviewAppPreferences(paparazzi.context)
        prefs.openReader(
            title = state.title,
            markdown = state.workbench.reportMarkdown ?: "",
            isArtifact = false,
        )
        paparazzi.snapshot(name = "report-reader") {
            HarnessTheme(darkTheme = false) {
                AppToastHost {
                    PreviewReportReaderScreen(preferences = prefs, onBack = {})
                }
            }
        }
    }

    @Test
    fun artifactReader_diffPreview() {
        val state = load("workbench-report-markdown.json")
        val prefs = PreviewAppPreferences(paparazzi.context)
        prefs.openArtifactReader(
            ReaderTarget(
                artifactId = "fixture-artifact",
                fileName = "artifact.md",
                mediaType = "text/markdown",
                fileKind = "markdown",
            ),
        )
        paparazzi.snapshot(name = "artifact-reader") {
            HarnessTheme(darkTheme = false) {
                AppToastHost {
                    PreviewReportReaderScreen(
                        preferences = prefs,
                        onBack = {},
                        loadPreview = {
                            Result.success(
                                ArtifactPreviewPayload(
                                    bytes = (state.workbench.reportMarkdown ?: "# Artifact").encodeToByteArray(),
                                    contentType = "text/markdown",
                                    fileName = "artifact.md",
                                    binary = false,
                                ),
                            )
                        },
                        loadDownload = {
                            Result.success(
                                ArtifactDownloadPayload(
                                    bytes = ByteArray(0),
                                    contentType = "text/markdown",
                                    fileName = "artifact.md",
                                ),
                            )
                        },
                    )
                }
            }
        }
    }
}
