package com.harness.agent.snapshot

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import app.cash.paparazzi.DeviceConfig
import app.cash.paparazzi.Paparazzi
import com.harness.agent.coreui.markdown.ChatMarkdown
import com.harness.agent.coreui.tokens.HarnessTheme
import com.harness.agent.model.ConversationItem
import com.harness.agent.preview.MobileContractPreviewLoader
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.junit.runners.Parameterized

/** Markdown golden：assistant 完成态正文（Markwon），与 manifest 中 preview fixture 对齐。 */
@RunWith(Parameterized::class)
class GateAMarkdownGoldenSnapshotTest(
    private val fixtureFileName: String,
) {
    @get:Rule
    val paparazzi =
        Paparazzi(
            deviceConfig = DeviceConfig.PIXEL_5,
            theme = "android:Theme.Material.Light.NoActionBar",
        )

    @Test
    fun assistantMarkdownBody() {
        val state = MobileContractPreviewLoader(paparazzi.context).load(fixtureFileName)
        val assistant =
            state.conversation.filterIsInstance<ConversationItem.Assistant>().lastOrNull()
                ?: error("no assistant in $fixtureFileName")
        val markdown =
            assistant.markdownContent?.takeIf { it.isNotBlank() }
                ?: error("empty markdownContent in $fixtureFileName")
        val snapshotName = fixtureFileName.removeSuffix(".json")
        paparazzi.snapshot(name = snapshotName) {
            HarnessTheme(darkTheme = false) {
                Box(modifier = Modifier.width(390.dp).padding(horizontal = 14.dp, vertical = 8.dp)) {
                    ChatMarkdown(markdown = markdown)
                }
            }
        }
    }

    companion object {
        /** 与 `packages/mobile-contract/fixtures/markdown-golden/manifest.json` 保持同步 */
        @JvmStatic
        @Parameterized.Parameters(name = "{0}")
        fun fixtures(): List<String> =
            listOf(
                "chat-markdown-gallery.json",
                "markdown-golden-wide-table.json",
                "markdown-golden-research-report.json",
                "markdown-golden-code-review.json",
                "markdown-golden-incident-summary.json",
            )
    }
}
