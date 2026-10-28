package com.harness.agent.snapshot

import app.cash.paparazzi.DeviceConfig
import app.cash.paparazzi.Paparazzi
import com.harness.agent.coreui.tokens.HarnessTheme
import com.harness.agent.preview.PreviewAppPreferences
import com.harness.agent.ui.settings.PreviewMemoryHubScreen
import com.harness.agent.ui.settings.PreviewMcpListScreen
import com.harness.agent.ui.settings.PreviewSettingsRootScreen
import org.junit.Rule
import org.junit.Test

/** S-SET / S-SET-MCP：Settings 根与 MCP 列表（UI 回归 #16/#17）。 */
class GateASettingsSnapshotTest {
    @get:Rule
    val paparazzi =
        Paparazzi(
            deviceConfig = DeviceConfig.PIXEL_5,
            theme = "android:Theme.Material.Light.NoActionBar",
        )

    @Test
    fun settingsRoot_default() {
        val prefs = PreviewAppPreferences(paparazzi.context)
        paparazzi.snapshot {
            HarnessTheme(darkTheme = false) {
                PreviewSettingsRootScreen(
                    preferences = prefs,
                    onBack = {},
                    onOpenMemory = {},
                    onOpenMcp = {},
                )
            }
        }
    }

    @Test
    fun mcpList_withSeedServer() {
        val prefs = PreviewAppPreferences(paparazzi.context)
        paparazzi.snapshot {
            HarnessTheme(darkTheme = false) {
                PreviewMcpListScreen(
                    preferences = prefs,
                    onBack = {},
                    onEditServer = {},
                )
            }
        }
    }

    @Test
    fun memoryHub_defaultEntries() {
        val prefs = PreviewAppPreferences(paparazzi.context)
        paparazzi.snapshot {
            HarnessTheme(darkTheme = false) {
                PreviewMemoryHubScreen(preferences = prefs, onBack = {})
            }
        }
    }
}
