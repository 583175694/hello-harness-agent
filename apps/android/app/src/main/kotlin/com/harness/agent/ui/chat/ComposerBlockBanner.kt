package com.harness.agent.ui.chat

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Info
import androidx.compose.material3.Icon
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.harness.agent.coreui.primitives.AppText
import com.harness.agent.coreui.primitives.AppTextStyle
import com.harness.agent.coreui.tokens.HarnessLayout
import com.harness.agent.coreui.tokens.LocalHarnessColors
import com.harness.agent.preview.PreviewComposerBlockKind

@Composable
fun ComposerBlockBanner(
    kind: PreviewComposerBlockKind,
    modifier: Modifier = Modifier,
    onLoginClick: () -> Unit = {},
) {
    if (kind == PreviewComposerBlockKind.NONE) return
    val colors = LocalHarnessColors.current
    val (message, action) =
        when (kind) {
            PreviewComposerBlockKind.LOGIN_REQUIRED ->
                "已配置 API，请先登录后再发送消息。" to "去登录"
            PreviewComposerBlockKind.TRANSCRIPT_INCOMPATIBLE ->
                "当前会话与所选模型不兼容，请新建会话或更换模型。" to null
            PreviewComposerBlockKind.NONE -> return
        }
    Row(
        modifier =
            modifier
                .fillMaxWidth()
                .background(colors.subtle, RoundedCornerShape(HarnessLayout.controlRadius))
                .padding(horizontal = 12.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Icon(
            imageVector = Icons.Rounded.Info,
            contentDescription = null,
            tint = colors.secondary,
        )
        AppText(text = message, style = AppTextStyle.Caption, modifier = Modifier.weight(1f))
        if (action != null) {
            AppText(
                text = action,
                style = AppTextStyle.Link,
                modifier = Modifier.clickable(onClick = onLoginClick),
            )
        }
    }
}
