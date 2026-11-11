package com.harness.agent.ui.workbench

import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.harness.agent.coreui.primitives.AppText
import com.harness.agent.coreui.primitives.AppTextStyle
import com.harness.agent.coreui.tokens.HarnessLayout
import com.harness.agent.coreui.tokens.LocalHarnessColors
import com.harness.agent.model.WorkbenchSourceCard
import com.harness.agent.model.WorkbenchState

@Composable
fun WorkbenchSourcesPane(
    state: WorkbenchState,
    onOpenPassage: (WorkbenchSourceCard) -> Unit,
    modifier: Modifier = Modifier,
) {
    val colors = LocalHarnessColors.current
    if (state.sources.isEmpty()) {
        WorkbenchTabEmptyState(
            title = if (state.sourcesRetrievalOnly) "检索进行中" else "暂无来源",
            message =
                if (state.sourcesRetrievalOnly) {
                    "网页检索完成后，引用来源会显示在这里。"
                } else {
                    "助手引用的网页与段落会汇总在此。"
                },
            modifier = modifier,
        )
        return
    }
    LazyColumn(
        modifier = modifier.fillMaxSize().padding(horizontal = 16.dp, vertical = 8.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        item {
            AppText(
                text = "共 ${state.sources.size} 个来源",
                style = AppTextStyle.Muted,
            )
        }
        items(state.sources, key = { it.url + it.title }) { card ->
            val openable = !card.passageBody.isNullOrBlank()
            Column(
                modifier =
                    Modifier
                        .fillMaxWidth()
                        .border(1.dp, colors.composerBorder, RoundedCornerShape(HarnessLayout.panelRadius))
                        .clickable(enabled = openable) { if (openable) onOpenPassage(card) }
                        .padding(12.dp),
                verticalArrangement = Arrangement.spacedBy(4.dp),
            ) {
                AppText(text = card.title, style = AppTextStyle.Title)
                AppText(text = card.url, style = AppTextStyle.Link)
                if (card.snippet.isNotBlank()) {
                    AppText(text = card.snippet, style = AppTextStyle.Muted)
                }
                if (openable) {
                    AppText(text = "查看引用段落", style = AppTextStyle.Link)
                }
            }
        }
    }
}
