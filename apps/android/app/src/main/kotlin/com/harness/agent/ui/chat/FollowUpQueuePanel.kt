package com.harness.agent.ui.chat

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowUpward
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.SubdirectoryArrowLeft
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.harness.agent.coreui.tokens.HarnessLayout
import com.harness.agent.coreui.tokens.LocalHarnessColors
import com.harness.agent.model.FollowUpFixture

/** 对齐 Web `.pending-input-card`：单行 ellipsis + ghost 28px 操作（非主发送钮）。 */
@Composable
fun FollowUpQueuePanel(
    items: List<FollowUpFixture>,
    modifier: Modifier = Modifier,
    onSend: (String) -> Unit = {},
    onDismiss: (String) -> Unit = {},
) {
    val colors = LocalHarnessColors.current
    Column(modifier = modifier.fillMaxWidth()) {
        items.forEachIndexed { index, item ->
            if (index > 0) {
                HorizontalDivider(color = colors.composerBorder, thickness = 1.dp)
            }
            Row(
                modifier =
                    Modifier
                        .fillMaxWidth()
                        .defaultMinSize(minHeight = HarnessLayout.followUpRowMinHeight)
                        .padding(
                            horizontal = HarnessLayout.followUpRowPaddingHorizontal,
                            vertical = HarnessLayout.followUpRowPaddingVertical,
                        ),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                Icon(
                    imageVector = Icons.Filled.SubdirectoryArrowLeft,
                    contentDescription = null,
                    modifier = Modifier.size(16.dp),
                    tint = colors.muted,
                )
                Text(
                    text = item.content,
                    color = colors.primary,
                    fontSize = 13.sp,
                    lineHeight = 18.sp,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.weight(1f),
                )
                Row(
                    horizontalArrangement = Arrangement.spacedBy(4.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    FollowUpGhostIconButton(
                        icon = Icons.Filled.ArrowUpward,
                        contentDescription = "发送跟进",
                        tint = colors.secondary,
                        onClick = { onSend(item.id) },
                    )
                    FollowUpGhostIconButton(
                        icon = Icons.Filled.Close,
                        contentDescription = "移除跟进",
                        tint = colors.muted,
                        onClick = { onDismiss(item.id) },
                    )
                }
            }
        }
    }
}

@Composable
private fun FollowUpGhostIconButton(
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    contentDescription: String,
    tint: androidx.compose.ui.graphics.Color,
    onClick: () -> Unit,
) {
    Box(
        modifier =
            Modifier
                .size(HarnessLayout.followUpActionSize)
                .clip(RoundedCornerShape(HarnessLayout.controlRadius))
                .clickable(onClick = onClick),
        contentAlignment = Alignment.Center,
    ) {
        Icon(
            imageVector = icon,
            contentDescription = contentDescription,
            modifier = Modifier.size(HarnessLayout.followUpSendIconSize),
            tint = tint,
        )
    }
}
