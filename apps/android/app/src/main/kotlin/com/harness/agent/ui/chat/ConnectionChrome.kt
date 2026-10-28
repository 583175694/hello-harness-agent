package com.harness.agent.ui.chat

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.harness.agent.coreui.primitives.AppText
import com.harness.agent.coreui.primitives.AppTextStyle
import com.harness.agent.coreui.tokens.LocalHarnessColors

@Composable
fun ServiceBanner(
    serviceState: String,
    onRetry: () -> Unit,
    onDismiss: () -> Unit,
    modifier: Modifier = Modifier,
) {
    if (serviceState == "ready") return
    val colors = LocalHarnessColors.current
    val message =
        when (serviceState) {
            "checking" -> "正在检查服务状态…"
            else -> "无法连接 Agent 服务，请检查 API 地址或网络。"
        }
    Column(
        modifier =
            modifier
                .fillMaxWidth()
                .background(colors.danger.copy(alpha = 0.12f))
                .padding(horizontal = 12.dp, vertical = 8.dp),
    ) {
        AppText(text = message, style = AppTextStyle.Body)
        Row(modifier = Modifier.padding(top = 6.dp)) {
            if (serviceState == "unavailable") {
                AppText(
                    text = "重新连接",
                    style = AppTextStyle.Link,
                    modifier = Modifier.clickable(onClick = onRetry).padding(end = 16.dp),
                )
            }
            AppText(
                text = "关闭",
                style = AppTextStyle.Muted,
                modifier = Modifier.clickable(onClick = onDismiss),
            )
        }
    }
}

@Composable
fun ProblemDetailsCard(
    title: String?,
    detail: String?,
    modifier: Modifier = Modifier,
) {
    if (title.isNullOrBlank() && detail.isNullOrBlank()) return
    val colors = LocalHarnessColors.current
    Column(
        modifier =
            modifier
                .fillMaxWidth()
                .padding(horizontal = 12.dp, vertical = 8.dp)
                .background(colors.subtle, RoundedCornerShape(12.dp))
                .padding(12.dp),
    ) {
        if (!title.isNullOrBlank()) {
            AppText(text = title, style = AppTextStyle.Title)
        }
        if (!detail.isNullOrBlank()) {
            AppText(text = detail, style = AppTextStyle.Body, modifier = Modifier.padding(top = 4.dp))
        }
    }
}
