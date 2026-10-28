package com.harness.agent.ui.chat

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Menu
import androidx.compose.material.icons.outlined.ViewColumn
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.harness.agent.coreui.primitives.Badge
import com.harness.agent.coreui.primitives.HarnessIconButton
import com.harness.agent.coreui.primitives.HarnessIconButtonShape
import com.harness.agent.coreui.tokens.HarnessLayout
import com.harness.agent.coreui.tokens.LocalContentFontSizeSp
import com.harness.agent.coreui.tokens.LocalHarnessColors

@Composable
fun ChatTopBar(
    title: String,
    connectionState: String,
    @Suppress("UNUSED_PARAMETER") runSummary: String?,
    @Suppress("UNUSED_PARAMETER") workbenchBadge: Int,
    onOpenDrawer: () -> Unit,
    onOpenWorkbench: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val colors = LocalHarnessColors.current
    val contentFont = LocalContentFontSizeSp.current.coerceIn(13, 20)
    val showConnection = connectionState != "live" && connectionState != "idle"
    Column(
        modifier =
            modifier
                .fillMaxWidth()
                .background(colors.canvas)
                .padding(bottom = 2.dp),
    ) {
        Row(
            modifier =
                Modifier
                    .fillMaxWidth()
                    .height(HarnessLayout.chatTopBarInnerRowHeight)
                    .padding(horizontal = 4.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            HarnessIconButton(
                icon = Icons.Outlined.Menu,
                contentDescription = "打开会话列表",
                onClick = onOpenDrawer,
            )
            Text(
                text = title,
                color = colors.primary,
                fontSize = (contentFont - 1).sp,
                fontWeight = FontWeight.SemiBold,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier =
                    Modifier
                        .weight(1f)
                        .padding(horizontal = 8.dp),
            )
            if (showConnection) {
                ConnectionPill(connectionState = connectionState)
            }
            HarnessIconButton(
                icon = Icons.Outlined.ViewColumn,
                contentDescription = "打开工作台",
                onClick = onOpenWorkbench,
                modifier = Modifier.padding(start = 2.dp),
            )
        }
        HorizontalDivider(
            color = colors.composerBorder.copy(alpha = HarnessLayout.composerDividerAlpha),
            thickness = 1.dp,
        )
    }
}

@Composable
private fun ConnectionPill(connectionState: String) {
    val label =
        when (connectionState) {
            "offline" -> "离线"
            "reconnecting" -> "重连中"
            "connecting" -> "连接中"
            else -> connectionState
        }
    Badge(text = label, modifier = Modifier.padding(end = 4.dp))
}
