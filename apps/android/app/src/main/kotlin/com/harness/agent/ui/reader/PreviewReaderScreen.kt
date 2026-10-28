package com.harness.agent.ui.reader

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.harness.agent.coreui.markdown.MarkdownBody
import com.harness.agent.coreui.primitives.AppScaffold
import com.harness.agent.coreui.primitives.AppText
import com.harness.agent.coreui.primitives.AppTextStyle
import com.harness.agent.coreui.primitives.AppTopBar
import com.harness.agent.coreui.tokens.HarnessLayout
import com.harness.agent.coreui.tokens.LocalHarnessColors
import com.harness.agent.preview.PreviewAppPreferences

/** 对齐 RN reader：canvas 底 + surface 内容卡片。 */
@Composable
fun PreviewReportReaderScreen(
    preferences: PreviewAppPreferences,
    onBack: () -> Unit,
) {
    val colors = LocalHarnessColors.current
    val body = preferences.readerMarkdown.ifBlank { "# 空报告\n\n从 Workbench 打开。" }
    AppScaffold(
        topBar = {
            AppTopBar(
                title = preferences.readerTitle,
                useCanvasBackground = true,
                trailing = {
                    AppText(
                        text = "返回",
                        style = AppTextStyle.Link,
                        modifier =
                            Modifier
                                .clickable(onClick = onBack)
                                .padding(end = 8.dp),
                    )
                },
            )
        },
    ) {
        Column(
            modifier =
                Modifier
                    .fillMaxSize()
                    .verticalScroll(rememberScrollState())
                    .padding(bottom = 16.dp),
        ) {
            Column(
                modifier =
                    Modifier
                        .fillMaxWidth()
                        .border(1.dp, colors.composerBorder, RoundedCornerShape(HarnessLayout.panelRadius))
                        .background(colors.surface, RoundedCornerShape(HarnessLayout.panelRadius))
                        .padding(16.dp),
            ) {
                if (preferences.readerIsArtifact) {
                    AppText(text = body, style = AppTextStyle.Caption)
                } else {
                    MarkdownBody(markdown = body)
                }
            }
        }
    }
}
