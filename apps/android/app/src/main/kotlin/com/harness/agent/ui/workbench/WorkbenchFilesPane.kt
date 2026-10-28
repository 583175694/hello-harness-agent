package com.harness.agent.ui.workbench

import android.widget.Toast
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Download
import androidx.compose.material.icons.outlined.Visibility
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
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
    val context = LocalContext.current
    if (files.isEmpty()) {
        AppText(
            text = "暂无文件",
            style = AppTextStyle.Muted,
            modifier = Modifier.padding(24.dp),
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
                    icon = Icons.Outlined.Visibility,
                    contentDescription = "预览 ${file.fileName}",
                    onClick = { onPreview(file) },
                )
                HarnessIconButton(
                    icon = Icons.Outlined.Download,
                    contentDescription = "下载 ${file.fileName}",
                    onClick = {
                        Toast.makeText(context, "Preview：已模拟下载 ${file.fileName}", Toast.LENGTH_SHORT).show()
                    },
                )
            }
        }
    }
}
