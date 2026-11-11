package com.harness.agent.ui.workbench

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.unit.dp
import com.harness.agent.coreui.primitives.AppText
import com.harness.agent.coreui.primitives.AppTextStyle
import com.harness.agent.coreui.tokens.HarnessLayout
import com.harness.agent.coreui.tokens.LocalHarnessColors
import com.harness.agent.model.WorkbenchArtifactVersion

@Composable
internal fun WorkbenchArtifactVersionsPane(
    versions: List<WorkbenchArtifactVersion>,
    restorePrompt: String?,
    onRequestRestore: (restoreArtifactId: String, expectedCurrentArtifactId: String) -> Unit,
    onBeginRevision: (artifactId: String) -> Unit = {},
    modifier: Modifier = Modifier,
) {
    val colors = LocalHarnessColors.current
    val current = versions.firstOrNull { it.selected } ?: versions.firstOrNull()
    if (versions.isEmpty() || current == null) {
        WorkbenchTabEmptyState(
            title = "暂无版本",
            message = "Artifact 版本链会在 Run 完成后出现。",
            modifier = modifier,
        )
        return
    }
    Column(
        modifier = modifier.padding(horizontal = 16.dp, vertical = 8.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        if (!restorePrompt.isNullOrBlank()) {
            AppText(text = restorePrompt, style = AppTextStyle.Muted)
        }
        versions.forEach { version ->
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
                    AppText(text = version.label, style = AppTextStyle.Body)
                    if (version.selected) {
                        AppText(text = "当前版本", style = AppTextStyle.Muted)
                    }
                }
                Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    AppText(
                        text = "修改",
                        style = AppTextStyle.Link,
                        modifier =
                            Modifier
                                .clickable { onBeginRevision(version.id) }
                                .padding(horizontal = 4.dp, vertical = 4.dp),
                    )
                    if (!version.selected) {
                        AppText(
                            text = "恢复",
                            style = AppTextStyle.Link,
                            modifier =
                                Modifier
                                    .clickable { onRequestRestore(version.id, current.id) }
                                    .padding(horizontal = 4.dp, vertical = 4.dp),
                        )
                    }
                }
            }
        }
    }
}
