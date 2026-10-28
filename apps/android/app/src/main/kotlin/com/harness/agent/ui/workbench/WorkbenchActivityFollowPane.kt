package com.harness.agent.ui.workbench

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowLeft
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowRight
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import com.harness.agent.coreui.primitives.WorkbenchStepSlider
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.harness.agent.coreui.primitives.AppText
import com.harness.agent.coreui.primitives.AppTextStyle
import com.harness.agent.coreui.primitives.HarnessIconButton
import com.harness.agent.coreui.tokens.HarnessLayout
import com.harness.agent.coreui.tokens.LocalHarnessColors
import com.harness.agent.model.WorkbenchSourceCard
import com.harness.agent.model.WorkbenchState
import com.harness.agent.model.WorkbenchToolExecution
import kotlin.math.roundToInt

@Composable
internal fun WorkbenchActivityFollowPane(
    state: WorkbenchState,
    modifier: Modifier = Modifier,
    initialStepId: String? = null,
) {
    val executions = state.toolExecutions
    if (executions.isEmpty()) {
        WorkbenchActivityEmptyState()
        return
    }
    val initialIndex =
        initialStepId?.let { id -> executions.indexOfFirst { it.id == id }.takeIf { it >= 0 } }
            ?: (executions.indexOfLast { it.status == "running" }.takeIf { it >= 0 }
                ?: executions.lastIndex)
    val executionKey = executions.joinToString(separator = ",") { it.id }
    var stepIndex by rememberSaveable(executionKey, initialStepId) {
        mutableIntStateOf(initialIndex.coerceIn(0, executions.lastIndex))
    }
    stepIndex = stepIndex.coerceIn(0, executions.lastIndex)
    val selected = executions[stepIndex]
    val relatedSources = relatedSources(state.sources, selected)

    val scrollState = rememberScrollState()
    Column(modifier = modifier.fillMaxSize()) {
        // weight 与 verticalScroll 不能挂在同一 Column：否则会按内容无限增高，把步骤条顶出 Sheet。
        Box(
            modifier =
                Modifier
                    .weight(1f)
                    .fillMaxWidth(),
        ) {
            Column(
                modifier =
                    Modifier
                        .fillMaxSize()
                        .verticalScroll(scrollState)
                        .padding(horizontal = 16.dp, vertical = 8.dp),
            ) {
                ToolExecutionDetail(tool = selected, sources = relatedSources)
            }
        }
        HorizontalDivider(color = LocalHarnessColors.current.composerBorder)
        WorkbenchStepFooter(
            stepIndex = stepIndex,
            stepCount = executions.size,
            onStepIndexChange = { stepIndex = it.coerceIn(0, executions.lastIndex) },
        )
    }
}

@Composable
private fun WorkbenchActivityEmptyState() {
    Column(
        modifier =
            Modifier
                .fillMaxWidth()
                .padding(horizontal = 16.dp, vertical = 48.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        AppText(text = "暂无过程记录", style = AppTextStyle.Body)
        AppText(
            text = "助手的检索、读取与命令执行会显示在这里。",
            style = AppTextStyle.Muted,
        )
    }
}

private fun relatedSources(
    sources: List<WorkbenchSourceCard>,
    tool: WorkbenchToolExecution,
): List<WorkbenchSourceCard> {
    if (sources.isEmpty()) return emptyList()
    if (tool.linkedSourceIndexes.isNotEmpty()) {
        return tool.linkedSourceIndexes.mapNotNull { idx -> sources.getOrNull(idx) }
    }
    if (tool.toolName == "web_search" || tool.toolName == "web_fetch") {
        return sources
    }
    return emptyList()
}

@Composable
private fun ToolExecutionDetail(
    tool: WorkbenchToolExecution,
    sources: List<WorkbenchSourceCard>,
) {
    val colors = LocalHarnessColors.current
    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            AppText(text = tool.title.ifBlank { tool.toolName }, style = AppTextStyle.Title)
            tool.elapsed?.let {
                AppText(text = it, style = AppTextStyle.Caption)
            }
        }
        AppText(text = tool.toolName, style = AppTextStyle.Muted)
        if (tool.inputSummary.isNotBlank()) {
            AppText(text = "输入", style = AppTextStyle.Caption)
            AppText(
                text = tool.inputSummary,
                style = AppTextStyle.Body,
                modifier =
                    Modifier
                        .fillMaxWidth()
                        .background(colors.subtle, RoundedCornerShape(HarnessLayout.panelRadius))
                        .padding(12.dp),
            )
        }
        val body =
            tool.bashOutput?.trim().orEmpty().ifBlank {
                tool.outputSummary?.trim().orEmpty().ifBlank {
                    tool.detail?.trim().orEmpty().ifBlank { "执行中，结果尚未生成" }
                }
            }
        if (tool.toolName == "bash" || tool.bashOutput != null) {
            androidx.compose.material3.Text(
                text = body,
                color = colors.terminalFg,
                fontSize = 12.sp,
                lineHeight = 18.sp,
                fontFamily = FontFamily.Monospace,
                modifier =
                    Modifier
                        .fillMaxWidth()
                        .background(colors.terminalBg, RoundedCornerShape(HarnessLayout.panelRadius))
                        .padding(12.dp),
            )
        } else {
            AppText(text = "结果", style = AppTextStyle.Caption)
            AppText(
                text = body,
                style = AppTextStyle.Body,
                modifier =
                    Modifier
                        .fillMaxWidth()
                        .background(colors.subtle, RoundedCornerShape(HarnessLayout.panelRadius))
                        .padding(12.dp),
            )
        }
        if (sources.isNotEmpty()) {
            AppText(text = "关联来源", style = AppTextStyle.Caption)
            sources.forEach { card ->
                Column(
                    modifier =
                        Modifier
                            .fillMaxWidth()
                            .padding(bottom = 8.dp)
                            .border(1.dp, colors.composerBorder, RoundedCornerShape(HarnessLayout.panelRadius))
                            .padding(12.dp),
                ) {
                    AppText(text = card.title, style = AppTextStyle.Body)
                    AppText(text = card.url, style = AppTextStyle.Link)
                    if (card.snippet.isNotBlank()) {
                        AppText(text = card.snippet, style = AppTextStyle.Muted, modifier = Modifier.padding(top = 4.dp))
                    }
                }
            }
        }
    }
}

@Composable
private fun WorkbenchStepFooter(
    stepIndex: Int,
    stepCount: Int,
    onStepIndexChange: (Int) -> Unit,
    modifier: Modifier = Modifier,
) {
    val colors = LocalHarnessColors.current
    val maxIndex = (stepCount - 1).coerceAtLeast(0)
    val safeBottom = rememberWorkbenchBottomSafePadding()
    Column(
        modifier =
            modifier
                .fillMaxWidth()
                .background(colors.surface)
                .padding(horizontal = HarnessLayout.workbenchStepFooterHorizontalPadding)
                .padding(top = HarnessLayout.workbenchStepFooterTopPadding)
                .padding(bottom = safeBottom + HarnessLayout.workbenchStepFooterBottomPadding),
        verticalArrangement = Arrangement.spacedBy(HarnessLayout.workbenchStepFooterContentGap),
    ) {
        AppText(
            text = "步骤 ${stepIndex + 1} / $stepCount",
            style = AppTextStyle.Caption,
            tabularNums = true,
        )
        Row(
            modifier =
                Modifier
                    .fillMaxWidth()
                    .semantics {
                        contentDescription = "步骤 ${stepIndex + 1}，共 $stepCount"
                    },
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(HarnessLayout.workbenchStepFooterContentGap),
        ) {
            HarnessIconButton(
                icon = Icons.AutoMirrored.Filled.KeyboardArrowLeft,
                contentDescription = "上一步",
                onClick = { onStepIndexChange((stepIndex - 1).coerceAtLeast(0)) },
                enabled = stepIndex > 0,
            )
            WorkbenchStepSlider(
                stepIndex = stepIndex,
                stepCount = stepCount,
                onStepIndexChange = onStepIndexChange,
                modifier = Modifier.weight(1f),
            )
            HarnessIconButton(
                icon = Icons.AutoMirrored.Filled.KeyboardArrowRight,
                contentDescription = "下一步",
                onClick = { onStepIndexChange((stepIndex + 1).coerceAtMost(maxIndex)) },
                enabled = stepIndex < maxIndex,
            )
        }
    }
}
