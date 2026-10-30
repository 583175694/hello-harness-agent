package com.harness.agent.snapshot

import app.cash.paparazzi.DeviceConfig
import app.cash.paparazzi.Paparazzi
import com.harness.agent.coreui.tokens.HarnessTheme
import com.harness.agent.ui.chat.ChatTopBar
import com.harness.agent.ui.chat.ProblemDetailsCard
import com.harness.agent.ui.chat.ServiceBanner
import com.harness.agent.ui.chat.SessionDrawerOverlay
import com.harness.agent.preview.MobileContractPreviewLoader
import com.harness.agent.coreui.primitives.AppSheet
import com.harness.agent.coreui.primitives.ListRow
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.height
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import org.junit.Rule
import org.junit.Test

/** Gate A 关键 Chrome / Composer 表面（fixture 名与 §43.16.3 对齐）。 */
class GateAChromeSnapshotTest {
    @get:Rule
    val paparazzi =
        Paparazzi(
            deviceConfig = DeviceConfig.PIXEL_5,
            theme = "android:Theme.Material.Light.NoActionBar",
        )

    @Test
    fun connectionOffline_serviceBanner() {
        paparazzi.snapshot {
            HarnessTheme(darkTheme = false) {
                ServiceBanner(
                    serviceState = "unavailable",
                    onRetry = {},
                    onDismiss = {},
                )
            }
        }
    }

    @Test
    fun connectionOffline_problemDetails() {
        paparazzi.snapshot {
            HarnessTheme(darkTheme = false) {
                ProblemDetailsCard(
                    title = "无法连接服务",
                    detail = "请检查网络连接与 API 地址。",
                )
            }
        }
    }

    @Test
    fun connectionReconnecting_pill() {
        paparazzi.snapshot {
            HarnessTheme(darkTheme = false) {
                ChatTopBar(
                    title = "连接恢复中",
                    connectionState = "reconnecting",
                    runSummary = "正在重连…",
                    workbenchBadge = 0,
                    onOpenDrawer = {},
                    onNewConversation = {},
                    onOpenWorkbench = {},
                )
            }
        }
    }

    @Test
    fun composerOverlay_modelSheetOpen() {
        paparazzi.snapshot {
            HarnessTheme(darkTheme = false) {
                Box(Modifier.height(520.dp)) {
                    AppSheet(visible = true, onDismiss = {}, title = "模型", previewReduceMotion = true) {
                        ListRow(title = "默认模型", onClick = {})
                        ListRow(title = "推理 · 高", onClick = {})
                        ListRow(title = "快速", onClick = {})
                    }
                }
            }
        }
    }

    @Test
    fun composerOverlay_attachmentSheetOpen() {
        paparazzi.snapshot {
            HarnessTheme(darkTheme = false) {
                Box(Modifier.height(520.dp)) {
                    AppSheet(visible = true, onDismiss = {}, title = "附件", previewReduceMotion = true) {
                        ListRow(title = "screenshot.png", subtitle = "假附件", onClick = {})
                    }
                }
            }
        }
    }

    @Test
    fun sessionDrawer_open() {
        val state = MobileContractPreviewLoader(paparazzi.context).load("long-thread-scroll.json")
        paparazzi.snapshot {
            HarnessTheme(darkTheme = false) {
                Box(Modifier.height(640.dp)) {
                    SessionDrawerOverlay(
                        visible = true,
                        sessions = state.sessionDrawer.sessions,
                        refreshing = false,
                        menuTarget = null,
                        onClose = {},
                        onNewConversation = {},
                        onRefresh = {},
                        onSelectSession = {},
                        onLongPressSession = {},
                        onDismissMenu = {},
                        onRenameSession = { _, _ -> },
                        onTogglePin = {},
                        onDeleteSession = {},
                        onOpenSettings = {},
                    )
                }
            }
        }
    }

    fun composerOverlay_skillSheetOpen() {
        paparazzi.snapshot {
            HarnessTheme(darkTheme = false) {
                Box(Modifier.height(520.dp)) {
                    AppSheet(visible = true, onDismiss = {}, title = "Skill", previewReduceMotion = true) {
                        ListRow(title = "/research", onClick = {})
                        ListRow(title = "/code-review", onClick = {})
                    }
                }
            }
        }
    }
}
