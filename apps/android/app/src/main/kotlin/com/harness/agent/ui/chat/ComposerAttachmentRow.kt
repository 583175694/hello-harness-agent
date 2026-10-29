package com.harness.agent.ui.chat

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Close
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.harness.agent.coreui.tokens.HarnessLayout
import com.harness.agent.coreui.tokens.LocalHarnessColors

@Composable
fun ComposerSkillChips(
    skills: List<String>,
    modifier: Modifier = Modifier,
) {
    if (skills.isEmpty()) return
    val colors = LocalHarnessColors.current
    Row(modifier = modifier, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
        skills.forEach { name ->
            Row(
                modifier =
                    Modifier
                        .background(colors.subtle, RoundedCornerShape(999.dp))
                        .border(1.dp, colors.composerBorder, RoundedCornerShape(999.dp))
                        .padding(horizontal = 8.dp, vertical = 4.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(4.dp),
            ) {
                Text(text = "▣", fontSize = 12.sp, color = colors.link)
                Text(text = name, fontSize = 12.sp, color = colors.link, maxLines = 1)
            }
        }
    }
}

@Composable
fun ComposerAttachmentStrip(
    fileNames: List<String>,
    modifier: Modifier = Modifier,
) {
    if (fileNames.isEmpty()) return
    val stripHeight = HarnessLayout.composerAttachmentStripHeight
    Row(
        modifier =
            modifier
                .height(stripHeight)
                .horizontalScroll(rememberScrollState()),
        horizontalArrangement = Arrangement.spacedBy(6.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        fileNames.forEach { fileName ->
            ComposerAttachmentCard(fileName = fileName, stripHeight = stripHeight)
        }
    }
}

@Composable
private fun ComposerAttachmentCard(
    fileName: String,
    stripHeight: androidx.compose.ui.unit.Dp,
) {
    val colors = LocalHarnessColors.current
    val shape = RoundedCornerShape(HarnessLayout.controlRadius)
    val cardModifier =
        Modifier
            .height(stripHeight)
            .background(colors.subtle, shape)
            .border(1.dp, colors.composerBorder, shape)

    if (isImageAttachment(fileName)) {
        Box(
            modifier = cardModifier.width(stripHeight),
            contentAlignment = Alignment.Center,
        ) {
            Text("IMG", fontSize = 10.sp, color = colors.muted)
        }
    } else {
        Row(
            modifier =
                cardModifier
                    .widthIn(min = 128.dp, max = HarnessLayout.composerAttachmentFileMaxWidth)
                    .padding(horizontal = 8.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Box(
                modifier =
                    Modifier
                        .size(32.dp)
                        .background(colors.canvas, RoundedCornerShape(4.dp)),
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    text = fileExtensionLabel(fileName),
                    fontSize = 9.sp,
                    fontWeight = FontWeight.Bold,
                    color = colors.link,
                )
            }
            Text(
                text = fileName,
                fontSize = 13.sp,
                fontWeight = FontWeight.Medium,
                color = colors.primary,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.weight(1f, fill = false),
            )
            Icon(
                imageVector = Icons.Rounded.Close,
                contentDescription = null,
                modifier = Modifier.size(14.dp),
                tint = colors.muted,
            )
        }
    }
}

private fun isImageAttachment(fileName: String): Boolean {
    val n = fileName.lowercase()
    return n.endsWith(".png") || n.endsWith(".jpg") || n.endsWith(".jpeg") || n.endsWith(".webp")
}

private fun fileExtensionLabel(fileName: String): String {
    val dot = fileName.lastIndexOf('.')
    if (dot < 0 || dot == fileName.length - 1) return "FILE"
    return fileName.substring(dot + 1).uppercase().take(4)
}
