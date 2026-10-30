package com.harness.agent.ui.reader

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.harness.agent.coreui.markdown.MarkdownBody
import com.harness.agent.coreui.primitives.AppScaffold
import com.harness.agent.coreui.primitives.AppText
import com.harness.agent.coreui.primitives.AppTextStyle
import com.harness.agent.preview.PreviewAppPreferences
import com.harness.agent.ui.settings.SettingsTopBar

/** Workbench 文件 / 报告全屏阅读：canvas 底、无内容卡片，顶栏与设置页一致（左上返回）。 */
@Composable
fun PreviewReportReaderScreen(
    preferences: PreviewAppPreferences,
    onBack: () -> Unit,
) {
    val body = preferences.readerMarkdown.ifBlank { "# 空报告\n\n从 Workbench 打开。" }
    AppScaffold(
        topBar = {
            SettingsTopBar(title = preferences.readerTitle, onBack = onBack)
        },
    ) {
        Column(
            modifier =
                Modifier
                    .fillMaxSize()
                    .verticalScroll(rememberScrollState())
                    .padding(top = 8.dp, bottom = 16.dp),
        ) {
            if (preferences.readerIsArtifact) {
                AppText(text = body, style = AppTextStyle.Caption)
            } else {
                MarkdownBody(markdown = body, modifier = Modifier.fillMaxWidth())
            }
        }
    }
}
