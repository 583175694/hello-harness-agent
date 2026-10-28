package com.harness.agent.ui.chat

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Close
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
    val colors = LocalHarnessColors.current
    Row(
        modifier =
            modifier
                .horizontalScroll(rememberScrollState())
                .padding(vertical = 2.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        fileNames.forEach { fileName ->
            ComposerAttachmentCard(fileName = fileName)
        }
    }
}

@Composable
private fun ComposerAttachmentCard(fileName: String) {
    val colors = LocalHarnessColors.current
    val isImage = fileName.lowercase().let { n ->
        n.endsWith(".png") || n.endsWith(".jpg") || n.endsWith(".jpeg") || n.endsWith(".webp")
    }
    if (isImage) {
        Box(
            modifier =
                Modifier
                    .size(64.dp)
                    .background(colors.subtle, RoundedCornerShape(HarnessLayout.controlRadius))
                    .border(1.dp, colors.composerBorder, RoundedCornerShape(HarnessLayout.controlRadius)),
            contentAlignment = Alignment.Center,
        ) {
            Text("IMG", fontSize = 11.sp, color = colors.muted)
        }
    } else {
        val ext = fileExtensionLabel(fileName)
        Row(
            modifier =
                Modifier
                    .height(72.dp)
                    .widthIn(max = 268.dp)
                    .background(colors.subtle, RoundedCornerShape(HarnessLayout.controlRadius))
                    .border(1.dp, colors.composerBorder, RoundedCornerShape(HarnessLayout.controlRadius))
                    .padding(horizontal = 12.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            Box(
                modifier =
                    Modifier
                        .size(40.dp)
                        .background(colors.canvas, RoundedCornerShape(4.dp)),
                contentAlignment = Alignment.Center,
            ) {
                Text(ext, fontSize = 10.sp, fontWeight = FontWeight.Bold, color = colors.link)
            }
            Column(modifier = Modifier.weight(1f, fill = false)) {
                Text(
                    text = fileName,
                    fontSize = 14.sp,
                    fontWeight = FontWeight.SemiBold,
                    color = colors.primary,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                Text(text = "Preview", fontSize = 12.sp, color = colors.muted)
            }
            Icon(
                imageVector = Icons.Outlined.Close,
                contentDescription = null,
                modifier = Modifier.size(16.dp),
                tint = colors.muted,
            )
        }
    }
}

private fun fileExtensionLabel(fileName: String): String {
    val dot = fileName.lastIndexOf('.')
    if (dot < 0 || dot == fileName.length - 1) return "FILE"
    return fileName.substring(dot + 1).uppercase().take(4)
}
