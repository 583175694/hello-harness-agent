package com.harness.agent.snapshot

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import app.cash.paparazzi.DeviceConfig
import app.cash.paparazzi.Paparazzi
import com.harness.agent.coreui.tokens.HarnessTheme
import com.harness.agent.preview.MobileContractPreviewLoader
import com.harness.agent.ui.PreviewChatShellSnapshot
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.junit.runners.Parameterized

/** 十场景整屏 Chat 壳（Drawer/Workbench 关闭，loader 初始态）。 */
@RunWith(Parameterized::class)
class GateAFullScreenSnapshotTest(
    private val fixtureFileName: String,
) {
    @get:Rule
    val paparazzi =
        Paparazzi(
            deviceConfig = DeviceConfig.PIXEL_5,
            theme = "android:Theme.Material.Light.NoActionBar",
        )

    @Test
    fun fullShell() {
        val state = MobileContractPreviewLoader(paparazzi.context).load(fixtureFileName)
        paparazzi.snapshot(name = fixtureFileName.removeSuffix(".json")) {
            HarnessTheme(darkTheme = false) {
                // 固定视口高度，避免长对话 fixture 撑破 Paparazzi 画布（IllegalArgumentException）
                Box(modifier = Modifier.fillMaxWidth().height(844.dp)) {
                    PreviewChatShellSnapshot(
                        state = state,
                        fixtureFileName = fixtureFileName,
                        modifier = Modifier.fillMaxSize(),
                    )
                }
            }
        }
    }

    companion object {
        @JvmStatic
        @Parameterized.Parameters(name = "{0}")
        fun fixtures(): List<String> =
            listOf(
                "empty-landing.json",
                "streaming-assistant-tail.json",
                "long-thread-scroll.json",
                "process-timeline-tools.json",
                "hitl-clarification.json",
                "hitl-tool-approval.json",
                "workbench-activity-bash.json",
                "workbench-report-markdown.json",
                "workbench-sources.json",
                "workbench-sources-retrieval-only.json",
                "connection-offline-error.json",
                "rich-session-showcase.json",
                "stock-market-review.json",
            )
    }
}
