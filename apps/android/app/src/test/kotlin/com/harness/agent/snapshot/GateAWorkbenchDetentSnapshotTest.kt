package com.harness.agent.snapshot

import app.cash.paparazzi.DeviceConfig
import app.cash.paparazzi.Paparazzi
import com.harness.agent.coreui.tokens.HarnessTheme
import com.harness.agent.preview.MobileContractPreviewLoader
import com.harness.agent.ui.PreviewChatShellSnapshot
import org.junit.Rule
import org.junit.Test

/** UI 回归 #2：Workbench 低档（44%）须露出 Composer（静态快照）。 */
class GateAWorkbenchDetentSnapshotTest {
    @get:Rule
    val paparazzi =
        Paparazzi(
            deviceConfig = DeviceConfig.PIXEL_5,
            theme = "android:Theme.Material.Light.NoActionBar",
        )

    @Test
    fun workbenchLowDetent_exposesComposer() {
        val loader = MobileContractPreviewLoader(paparazzi.context)
        val base = loader.load("workbench-sources.json")
        val state =
            base.copy(
                workbench = base.workbench.copy(initialSheetIndex = 0),
            )
        paparazzi.snapshot(name = "workbench-low-detent-44pct") {
            HarnessTheme(darkTheme = false) {
                PreviewChatShellSnapshot(
                    state = state,
                    fixtureFileName = "workbench-sources.json",
                    workbenchOpen = true,
                )
            }
        }
    }
}
