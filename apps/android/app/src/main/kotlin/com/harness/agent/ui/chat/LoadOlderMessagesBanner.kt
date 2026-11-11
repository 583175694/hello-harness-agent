package com.harness.agent.ui.chat

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.harness.agent.coreui.tokens.LocalHarnessColors

@Composable
fun LoadOlderMessagesBanner(
    loading: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val colors = LocalHarnessColors.current
    val label = if (loading) "正在加载更早消息…" else "加载更早消息"
    Text(
        text = label,
        modifier =
            modifier
                .fillMaxWidth()
                .clickable(enabled = !loading, onClick = onClick)
                .padding(vertical = 12.dp),
        color = colors.secondary,
        fontSize = 13.sp,
        textAlign = TextAlign.Center,
    )
}
