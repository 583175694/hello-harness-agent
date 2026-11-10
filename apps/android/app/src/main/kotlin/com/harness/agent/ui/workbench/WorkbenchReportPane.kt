package com.harness.agent.ui.workbench

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.harness.agent.coreui.markdown.ChatMarkdown
import com.harness.agent.coreui.primitives.AppButton
import com.harness.agent.coreui.primitives.AppText
import com.harness.agent.coreui.primitives.AppTextStyle
import com.harness.agent.model.WorkbenchState

@Composable
fun WorkbenchReportPane(
    state: WorkbenchState,
    onOpenFullScreen: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val markdown = state.reportMarkdown?.trim().orEmpty()
    if (markdown.isEmpty()) {
        WorkbenchTabEmptyState(
            title = "暂无报告",
            message = "Run 生成报告后会显示在这里。",
            modifier = modifier,
        )
        return
    }
    Column(
        modifier =
            modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 16.dp, vertical = 8.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            AppText(
                text = "报告预览",
                style = AppTextStyle.Muted,
                modifier = Modifier.weight(1f),
            )
            AppButton(text = "全屏阅读", onClick = onOpenFullScreen)
        }
        ChatMarkdown(
            markdown = markdown,
            modifier = Modifier.fillMaxWidth(),
        )
    }
}
