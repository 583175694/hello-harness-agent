package com.harness.agent.snapshot

import app.cash.paparazzi.DeviceConfig
import app.cash.paparazzi.Paparazzi
import com.harness.agent.coreui.tokens.HarnessTheme
import com.harness.agent.preview.MobileContractPreviewLoader
import com.harness.agent.preview.PreviewAppPreferences
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
            markdown = state.workbench.reportMarkdown ?: "# Preview Report",
            isArtifact = false,
        )
        paparazzi.snapshot(name = "report-reader") {
            HarnessTheme(darkTheme = false) {
                PreviewReportReaderScreen(preferences = prefs, onBack = {})
            }
        }
    }

    @Test
    fun artifactReader_diffPreview() {
        val state = load("workbench-report-markdown.json")
        val prefs = PreviewAppPreferences(paparazzi.context)
        prefs.openReader(
            title = "Artifact",
            markdown = state.workbench.artifactDiffPreview ?: "--- diff",
            isArtifact = true,
        )
        paparazzi.snapshot(name = "artifact-reader") {
            HarnessTheme(darkTheme = false) {
                PreviewReportReaderScreen(preferences = prefs, onBack = {})
            }
        }
    }
}
