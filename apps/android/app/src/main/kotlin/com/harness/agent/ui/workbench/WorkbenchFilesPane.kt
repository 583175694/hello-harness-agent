package com.harness.agent.ui.workbench

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Download
import androidx.compose.material.icons.rounded.Visibility
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.unit.dp
import com.harness.agent.coreui.feedback.LocalAppToast
import com.harness.agent.coreui.primitives.AppText
import com.harness.agent.coreui.primitives.AppTextStyle
import com.harness.agent.coreui.primitives.HarnessIconButton
import com.harness.agent.coreui.tokens.HarnessLayout
import com.harness.agent.coreui.tokens.LocalHarnessColors
import com.harness.agent.model.WorkbenchDeliverableFile

@Composable
internal fun WorkbenchFilesPane(
    files: List<WorkbenchDeliverableFile>,
    onPreview: (WorkbenchDeliverableFile) -> Unit,
    modifier: Modifier = Modifier,
) {
    val colors = LocalHarnessColors.current
    val toast = LocalAppToast.current
    if (files.isEmpty()) {
        WorkbenchTabEmptyState(
            title = "暂无文件",
            message = "运行完成后，报告与导出文件会显示在这里。",
            modifier = modifier,
        )
        return
    }
    Column(
        modifier = modifier.padding(horizontal = 16.dp, vertical = 8.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        files.forEach { file ->
            Row(
                modifier =
                    Modifier
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(HarnessLayout.panelRadius))
                        .border(1.dp, colors.composerBorder, RoundedCornerShape(HarnessLayout.panelRadius))
                        .background(colors.surface, RoundedCornerShape(HarnessLayout.panelRadius))
                        .padding(horizontal = 14.dp, vertical = 12.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Column(modifier = Modifier.weight(1f)) {
                    AppText(text = file.fileName, style = AppTextStyle.Body)
                    if (file.subtitle.isNotBlank()) {
                        AppText(text = file.subtitle, style = AppTextStyle.Muted, modifier = Modifier.padding(top = 2.dp))
                    }
                }
                HarnessIconButton(
                    icon = Icons.Rounded.Visibility,
                    contentDescription = "预览 ${file.fileName}",
                    onClick = { onPreview(file) },
                )
                HarnessIconButton(
                    icon = Icons.Rounded.Download,
                    contentDescription = "下载 ${file.fileName}",
                    onClick = {
                        toast.show("Preview：已模拟下载 ${file.fileName}")
                    },
                )
            }
        }
    }
}
