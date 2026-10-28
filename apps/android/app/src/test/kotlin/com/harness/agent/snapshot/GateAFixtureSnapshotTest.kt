package com.harness.agent.snapshot

import app.cash.paparazzi.DeviceConfig
import app.cash.paparazzi.Paparazzi
import com.harness.agent.coreui.tokens.HarnessTheme
import com.harness.agent.preview.MobileContractPreviewLoader
import com.harness.agent.model.ConversationItem
import com.harness.agent.ui.chat.AssistantMessageBubble
import com.harness.agent.ui.chat.ChatLandingHero
import com.harness.agent.ui.chat.UserMessageBubble
import com.harness.agent.ui.chat.ChatTopBar
import com.harness.agent.ui.chat.ComposerStack
import com.harness.agent.ui.chat.ProblemDetailsCard
import com.harness.agent.ui.chat.ServiceBanner
import com.harness.agent.ui.workbench.WorkbenchPassageSheet
import com.harness.agent.ui.workbench.WorkbenchRestoreConfirmSheet
import com.harness.agent.ui.workbench.WorkbenchSheetOverlay
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.height
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import org.junit.Rule
import org.junit.Test

/** 十场景 fixture 驱动的关键 UI 表面（与 43 §16.3 文件名对齐）。 */
class GateAFixtureSnapshotTest {
    @get:Rule
    val paparazzi =
        Paparazzi(
            deviceConfig = DeviceConfig.PIXEL_5,
            theme = "android:Theme.Material.Light.NoActionBar",
        )

    private fun load(fileName: String) = MobileContractPreviewLoader(paparazzi.context).load(fileName)

    @Test
    fun emptyLanding() {
        paparazzi.snapshot {
            HarnessTheme {
                ChatLandingHero(welcomeText = "欢迎回来，想从哪里开始？")
            }
        }
    }

    @Test
    fun hitlClarification_composer() {
        val state = load("hitl-clarification.json")
        paparazzi.snapshot {
            HarnessTheme {
                ComposerStack(state = state.composer)
            }
        }
    }

    @Test
    fun hitlToolApproval_composer() {
        val state = load("hitl-tool-approval.json")
        paparazzi.snapshot {
            HarnessTheme {
                ComposerStack(state = state.composer)
            }
        }
    }

    @Test
    fun processTimelineTools_composer() {
        val state = load("process-timeline-tools.json")
        paparazzi.snapshot {
            HarnessTheme {
                ComposerStack(state = state.composer)
            }
        }
    }

    @Test
    fun processTimelineTools_assistantTurn() {
        val state = load("process-timeline-tools.json")
        val assistant = state.conversation.filterIsInstance<ConversationItem.Assistant>().first()
        paparazzi.snapshot {
            HarnessTheme {
                AssistantMessageBubble(item = assistant)
            }
        }
    }

    @Test
    fun streamingAssistantTail_composerAndTurn() {
        val state = load("streaming-assistant-tail.json")
        val assistant = state.conversation.filterIsInstance<com.harness.agent.model.ConversationItem.Assistant>().first()
        paparazzi.snapshot {
            HarnessTheme {
                AssistantMessageBubble(item = assistant)
                ComposerStack(state = state.composer)
            }
        }
    }

    @Test
    fun connectionOfflineError_chromeStack() {
        val state = load("connection-offline-error.json")
        paparazzi.snapshot {
            HarnessTheme {
                ChatTopBar(
                    title = state.title,
                    connectionState = state.chrome.connectionState,
                    runSummary = state.chrome.runSummary,
                    workbenchBadge = 0,
                    onOpenDrawer = {},
                    onOpenWorkbench = {},
                )
                ServiceBanner(serviceState = state.chrome.serviceState, onRetry = {}, onDismiss = {})
                ProblemDetailsCard(title = state.problemTitle, detail = state.problemDetail)
            }
        }
    }

    @Test
    fun workbenchReportMarkdown_sheet() {
        val state = load("workbench-report-markdown.json")
        paparazzi.snapshot {
            HarnessTheme {
                Box(Modifier.height(640.dp)) {
                    WorkbenchSheetOverlay(
                        visible = true,
                        state = state.workbench,
                        onDismiss = {},
                    )
                }
            }
        }
    }

    @Test
    fun workbenchReportMarkdown_artifactTab() {
        val state = load("workbench-report-markdown.json")
        val wb = state.workbench.copy(initialView = "artifact")
        paparazzi.snapshot {
            HarnessTheme {
                Box(Modifier.height(640.dp)) {
                    WorkbenchSheetOverlay(visible = true, state = wb, onDismiss = {})
                }
            }
        }
    }

    @Test
    fun richSessionShowcase_sheet() {
        val state = load("rich-session-showcase.json")
        paparazzi.snapshot {
            HarnessTheme {
                Box(Modifier.height(640.dp)) {
                    WorkbenchSheetOverlay(
                        visible = true,
                        state = state.workbench,
                        onDismiss = {},
                        previewReduceMotion = true,
                    )
                }
            }
        }
    }

    @Test
    fun workbenchReportMarkdown_artifactRestoreConfirm() {
        val state = load("workbench-report-markdown.json")
        paparazzi.snapshot {
            HarnessTheme {
                Box(Modifier.height(420.dp)) {
                    WorkbenchRestoreConfirmSheet(
                        visible = true,
                        prompt = state.workbench.artifactRestorePrompt,
                        onDismiss = {},
                        onConfirm = {},
                    )
                }
            }
        }
    }

    @Test
    fun longThreadScroll_sampleTurns() {
        val state = load("long-thread-scroll.json")
        val sample = state.conversation.take(2)
        paparazzi.snapshot {
            HarnessTheme {
                sample.forEach { item ->
                    when (item) {
                        is ConversationItem.User -> UserMessageBubble(text = item.content)
                        is ConversationItem.Assistant -> AssistantMessageBubble(item = item)
                    }
                }
            }
        }
    }

    @Test
    fun workbenchActivityBash_sheet() {
        val state = load("workbench-activity-bash.json")
        paparazzi.snapshot {
            HarnessTheme {
                Box(Modifier.height(640.dp)) {
                    WorkbenchSheetOverlay(visible = true, state = state.workbench, onDismiss = {})
                }
            }
        }
    }

    @Test
    fun workbenchSources_sheet() {
        val state = load("workbench-sources.json")
        paparazzi.snapshot {
            HarnessTheme {
                Box(Modifier.height(640.dp)) {
                    WorkbenchSheetOverlay(visible = true, state = state.workbench, onDismiss = {})
                }
            }
        }
    }

    @Test
    fun workbenchSources_passageHalfSheet() {
        val state = load("workbench-sources.json")
        val card =
            state.workbench.sources.firstOrNull { !it.passageBody.isNullOrBlank() }
                ?: error("workbench-sources.json needs passageBody (#14)")
        paparazzi.snapshot {
            HarnessTheme {
                Box(Modifier.height(520.dp)) {
                    WorkbenchPassageSheet(card = card, onDismiss = {})
                }
            }
        }
    }

    @Test
    fun workbenchSourcesRetrievalOnly_sheet() {
        val state = load("workbench-sources-retrieval-only.json")
        paparazzi.snapshot {
            HarnessTheme {
                Box(Modifier.height(640.dp)) {
                    WorkbenchSheetOverlay(visible = true, state = state.workbench, onDismiss = {})
                }
            }
        }
    }
}
