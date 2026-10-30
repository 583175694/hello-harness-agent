package com.harness.agent.ui.chat

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.harness.agent.coreui.R
import com.harness.agent.coreui.primitives.Badge
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
    onNewConversation: () -> Unit,
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
                .padding(bottom = 6.dp),
    ) {
        Row(
            modifier =
                Modifier
                    .fillMaxWidth()
                    .height(HarnessLayout.chatTopBarInnerRowHeight)
                    .padding(horizontal = 12.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            ChatTopBarCircleChrome(
                iconDrawable = R.drawable.harness_chat_top_sessions,
                contentDescription = "打开会话列表",
                onClick = onOpenDrawer,
            )
            Text(
                text = title,
                color = colors.primary,
                fontSize = (contentFont + 1).sp,
                fontWeight = FontWeight.SemiBold,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                textAlign = TextAlign.Start,
                modifier =
                    Modifier
                        .weight(1f)
                        .padding(start = 12.dp, end = 8.dp),
            )
            if (showConnection) {
                ConnectionPill(connectionState = connectionState)
            }
            ChatTopBarActionCapsule {
                ChatTopBarCapsuleIcon(
                    iconDrawable = R.drawable.harness_chat_top_new_chat,
                    contentDescription = "新建会话",
                    onClick = onNewConversation,
                )
                ChatTopBarCapsuleIcon(
                    iconDrawable = R.drawable.harness_chat_top_more,
                    contentDescription = "打开工作台",
                    onClick = onOpenWorkbench,
                )
            }
        }
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
