package com.harness.agent.snapshot

import app.cash.paparazzi.DeviceConfig
import app.cash.paparazzi.Paparazzi
import com.harness.agent.coreui.tokens.HarnessTheme
import com.harness.agent.preview.MobileContractPreviewLoader
import com.harness.agent.ui.PreviewChatShellSnapshot
import org.junit.Rule
import org.junit.Test

/** §4.3 Settings Light/Dark 与字号 — 深色整屏 Landing 基线。 */
class GateAThemeSnapshotTest {
    @get:Rule
    val paparazzi =
        Paparazzi(
            deviceConfig = DeviceConfig.PIXEL_5,
            theme = "android:Theme.Material.NoActionBar",
        )

    @Test
    fun darkTheme_emptyLanding_fullShell() {
        val state = MobileContractPreviewLoader(paparazzi.context).load("empty-landing.json")
        paparazzi.snapshot {
            HarnessTheme(darkTheme = true, contentFontSizeSp = 17) {
                PreviewChatShellSnapshot(state = state, fixtureFileName = "empty-landing.json")
            }
        }
    }
}
