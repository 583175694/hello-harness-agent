package com.harness.agent.ui.chat

import androidx.compose.foundation.background
import androidx.compose.ui.draw.clip
import androidx.compose.foundation.border
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Close
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.harness.agent.coreui.tokens.HarnessLayout
import com.harness.agent.media.HarnessAuthedAsyncImage
import com.harness.agent.media.isLocalPreviewUri
import com.harness.agent.coreui.tokens.LocalHarnessColors
import com.harness.agent.model.ComposerAttachmentItem

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
    items: List<ComposerAttachmentItem> = emptyList(),
    modifier: Modifier = Modifier,
    onRemoveAttachment: ((String) -> Unit)? = null,
) {
    if (items.isEmpty() && fileNames.isEmpty()) return
    val stripHeight = HarnessLayout.composerAttachmentStripHeight
    Row(
        modifier =
            modifier
                .heightIn(min = stripHeight)
                .horizontalScroll(rememberScrollState()),
        horizontalArrangement = Arrangement.spacedBy(6.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        if (items.isNotEmpty()) {
            items.forEach { item ->
                ComposerAttachmentItemCard(
                    item = item,
                    stripHeight = stripHeight,
                    onRemove = onRemoveAttachment?.let { remove -> { remove(item.id) } },
                )
            }
        } else {
            fileNames.forEach { fileName ->
                ComposerAttachmentCard(
                    fileName = fileName,
                    stripHeight = stripHeight,
                    onRemove = onRemoveAttachment?.let { remove -> { remove(fileName) } },
                )
            }
        }
    }
}

@Composable
private fun ComposerAttachmentItemCard(
    item: ComposerAttachmentItem,
    stripHeight: androidx.compose.ui.unit.Dp,
    onRemove: (() -> Unit)? = null,
) {
    val colors = LocalHarnessColors.current
    val shape = RoundedCornerShape(HarnessLayout.controlRadius)
    val cardModifier =
        Modifier
            .heightIn(min = stripHeight)
            .background(colors.subtle, shape)
            .border(1.dp, colors.composerBorder, shape)
    if (isImageAttachment(item.fileName) || item.mediaType.startsWith("image/")) {
        Box(modifier = cardModifier.width(stripHeight).clip(shape)) {
            if (onRemove != null) {
                androidx.compose.material3.IconButton(
                    onClick = onRemove,
                    modifier = Modifier.align(Alignment.TopEnd).size(24.dp),
                ) {
                    Icon(
                        Icons.Rounded.Close,
                        contentDescription = "移除附件 ${item.fileName}",
                        modifier = Modifier.size(14.dp),
                    )
                }
            }
            if (!item.previewUri.isNullOrBlank()) {
                HarnessAuthedAsyncImage(
                    fileId = item.id,
                    serverPreviewUrl = item.previewUri.takeUnless { isLocalPreviewUri(it) },
                    localPreviewUri = item.previewUri.takeIf { isLocalPreviewUri(it) },
                    contentDescription = item.fileName,
                    modifier = Modifier.fillMaxSize().clip(shape),
                    contentScale = ContentScale.Crop,
                )
            } else {
                Box(modifier = Modifier.fillMaxSize().padding(4.dp), contentAlignment = Alignment.Center) {
                    Text(
                        text = fileExtensionLabel(item.fileName),
                        fontSize = 9.sp,
                        fontWeight = FontWeight.Bold,
                        color = colors.muted,
                        maxLines = 1,
                        overflow = TextOverflow.Clip,
                    )
                }
            }
            if (item.status == "processing") {
                Box(
                    modifier =
                        Modifier
                            .fillMaxSize()
                            .background(colors.surface.copy(alpha = 0.55f)),
                    contentAlignment = Alignment.Center,
                ) {
                    CircularProgressIndicator(modifier = Modifier.size(18.dp), strokeWidth = 2.dp)
                }
            }
        }
    } else {
        ComposerAttachmentCard(
            fileName = item.fileName,
            stripHeight = stripHeight,
            processing = item.status == "processing",
            onRemove = onRemove,
        )
    }
}

@Composable
private fun ComposerAttachmentCard(
    fileName: String,
    stripHeight: androidx.compose.ui.unit.Dp,
    processing: Boolean = false,
    onRemove: (() -> Unit)? = null,
) {
    val colors = LocalHarnessColors.current
    val shape = RoundedCornerShape(HarnessLayout.controlRadius)
    val cardModifier =
        Modifier
            .heightIn(min = stripHeight)
            .background(colors.subtle, shape)
            .border(1.dp, colors.composerBorder, shape)

    if (isImageAttachment(fileName)) {
        Box(
            modifier = cardModifier.width(stripHeight),
            contentAlignment = Alignment.Center,
        ) {
            Text(
                text = fileExtensionLabel(fileName),
                fontSize = 9.sp,
                fontWeight = FontWeight.Bold,
                color = colors.muted,
                maxLines = 1,
                overflow = TextOverflow.Clip,
            )
            if (onRemove != null) {
                androidx.compose.material3.IconButton(
                    onClick = onRemove,
                    modifier = Modifier.align(Alignment.TopEnd).size(24.dp),
                ) {
                    Icon(
                        Icons.Rounded.Close,
                        contentDescription = "移除附件 $fileName",
                        modifier = Modifier.size(14.dp),
                    )
                }
            }
        }
    } else {
        Row(
            modifier =
                cardModifier
                    .widthIn(min = 128.dp, max = HarnessLayout.composerAttachmentFileMaxWidth)
                    .padding(horizontal = 8.dp, vertical = 6.dp),
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
                if (processing) {
                    CircularProgressIndicator(modifier = Modifier.size(16.dp), strokeWidth = 2.dp)
                } else {
                    Text(
                        text = fileExtensionLabel(fileName),
                        fontSize = 9.sp,
                        fontWeight = FontWeight.Bold,
                        color = colors.link,
                        maxLines = 1,
                        overflow = TextOverflow.Clip,
                    )
                }
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
            if (onRemove != null) {
                androidx.compose.material3.IconButton(onClick = onRemove, modifier = Modifier.size(24.dp)) {
                    Icon(
                        imageVector = Icons.Rounded.Close,
                        contentDescription = "移除附件 $fileName",
                        modifier = Modifier.size(14.dp),
                        tint = colors.muted,
                    )
                }
            }
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
