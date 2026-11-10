package com.harness.agent.snapshot

import app.cash.paparazzi.DeviceConfig
import app.cash.paparazzi.Paparazzi
import com.harness.agent.coreui.feedback.AppToastHost
import com.harness.agent.coreui.tokens.HarnessTheme
import com.harness.agent.preview.PreviewAppPreferences
import com.harness.agent.ui.reader.PreviewReportReaderScreen
import org.junit.Rule
import org.junit.Test

/** 回归：Markdown Reader 里多行单元格表格必须按真实行高排版，不能压到下一行 / 溢出表格。 */
class TableIssueReproSnapshotTest {
    @get:Rule
    val paparazzi =
        Paparazzi(
            deviceConfig = DeviceConfig.PIXEL_5,
            theme = "android:Theme.Material.Light.NoActionBar",
        )

    @Test
    fun readerMultilineTableCells() {
        val markdown = """
            ## 二、怎么去：三种方案对比

            方案A（推荐）高铁 + 宁国南站租车

            | 段 | 方式 | 参考耗时 | 说明 |
            | --- | --- | --- | --- |
            | 深圳北 → 宁国南 | 直达高铁 | 7.5—8.2 小时 | 二等座约 ¥600—700，建议提前 1—2 周购买 |
            | 黄山北 → 宁国南 | 宣绩高铁 | 30—40 分钟 | 宣绩高铁 2024 年开通，黄山北站换乘方便 |
            | 宁国南站 → 市区 | 打车/网约车 | 15—20 分钟 | 站前取车，还车点建议选同一门店；市区酒店多在宁国大道附近 |

            回程：宁国南 → 黄山北（早班车）→ G697 或 G2777 回深圳北。
        """.trimIndent()
        val prefs = PreviewAppPreferences(paparazzi.context)
        prefs.openReader(title = "深圳到宁国旅游攻略.md", markdown = markdown, isArtifact = false)
        paparazzi.snapshot(name = "reader-multiline-table-cells") {
            HarnessTheme(darkTheme = false) {
                AppToastHost {
                    PreviewReportReaderScreen(preferences = prefs, onBack = {})
                }
            }
        }
    }
}
