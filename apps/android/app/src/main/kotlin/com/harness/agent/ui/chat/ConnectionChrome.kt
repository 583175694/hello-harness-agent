package com.harness.agent.ui.chat

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.graphics.luminance
import androidx.compose.ui.unit.sp
import com.harness.agent.coreui.primitives.AppText
import com.harness.agent.coreui.primitives.AppTextStyle
import com.harness.agent.coreui.tokens.LocalHarnessColors
import androidx.compose.material3.Text

private val NetworkBarBackgroundLight = androidx.compose.ui.graphics.Color(0xFFFCECEA)
private val NetworkBarForegroundLight = androidx.compose.ui.graphics.Color(0xFF6B5B58)
private val NetworkBarBackgroundDark = androidx.compose.ui.graphics.Color(0xFF2A2221)
private val NetworkBarForegroundDark = androidx.compose.ui.graphics.Color(0xFFC4B8B5)

/** 微信式无网络条：单行 + 左侧警示 + 右侧「重新连接」。 */
@Composable
fun ServiceBanner(
    serviceState: String,
    onRetry: () -> Unit,
    onDismiss: () -> Unit,
    modifier: Modifier = Modifier,
) {
    if (serviceState == "ready") return
    @Suppress("UNUSED_PARAMETER")
    val unusedDismiss = onDismiss
    val colors = LocalHarnessColors.current
    val isDark = colors.canvas.luminance() < 0.45f
    val barBackground = if (isDark) NetworkBarBackgroundDark else NetworkBarBackgroundLight
    val barForeground = if (isDark) NetworkBarForegroundDark else NetworkBarForegroundLight
    val message =
        when (serviceState) {
            "checking" -> "正在检查服务状态…"
            else -> "当前无法连接服务，请检查网络与 API 地址。"
        }
    Row(
        modifier =
            modifier
                .fillMaxWidth()
                .background(barBackground)
                .padding(horizontal = 12.dp, vertical = 9.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(
            modifier =
                Modifier
                    .size(18.dp)
                    .clip(CircleShape)
                    .background(colors.danger),
            contentAlignment = Alignment.Center,
        ) {
            Text(
                text = "!",
                color = colors.primaryForeground,
                fontSize = 12.sp,
                lineHeight = 12.sp,
            )
        }
        Text(
            text = message,
            color = barForeground,
            fontSize = 13.sp,
            lineHeight = 18.sp,
            maxLines = 2,
            overflow = TextOverflow.Ellipsis,
            modifier =
                Modifier
                    .weight(1f)
                    .padding(horizontal = 8.dp),
        )
        if (serviceState == "unavailable") {
            Text(
                text = "重新连接",
                color = colors.link,
                fontSize = 13.sp,
                modifier = Modifier.clickable(onClick = onRetry),
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
