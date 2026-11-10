package com.harness.agent.ui.workbench

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Download
import androidx.compose.material.icons.rounded.Edit
import androidx.compose.material.icons.rounded.MoreVert
import androidx.compose.material.icons.rounded.Restore
import androidx.compose.material3.Icon
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.TransformOrigin
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.layout.positionInRoot
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.harness.agent.coreui.motion.rememberHarnessReduceMotion
import com.harness.agent.coreui.primitives.AppDivider
import com.harness.agent.coreui.primitives.AppText
import com.harness.agent.coreui.primitives.AppTextStyle
import com.harness.agent.coreui.primitives.HarnessIconButton
import com.harness.agent.coreui.tokens.HarnessLayout
import com.harness.agent.coreui.tokens.LocalHarnessColors
import com.harness.agent.model.WorkbenchArtifactVersion
import com.harness.agent.model.WorkbenchDeliverableFile
import com.harness.agent.model.WorkbenchState
import kotlin.math.roundToInt

/** 产物 Tab 只展示一条列表：优先 [WorkbenchState.deliverableFiles]，否则回退版本链。 */
internal fun resolveWorkbenchArtifactRows(state: WorkbenchState): List<WorkbenchDeliverableFile> {
    if (state.deliverableFiles.isNotEmpty()) return state.deliverableFiles
    val current =
        state.artifactVersions.firstOrNull { it.selected }
            ?: state.artifactVersions.lastOrNull()
    return state.artifactVersions.map { version ->
        version.toDeliverableFile(expectedCurrentId = current?.id)
    }
}

private fun WorkbenchArtifactVersion.toDeliverableFile(expectedCurrentId: String?): WorkbenchDeliverableFile {
    val name = logicalName?.takeIf { it.isNotBlank() } ?: label.substringBefore("·").trim()
    val versionLabel = versionNumber?.let { "v$it" }.orEmpty()
    val subtitle =
        buildList {
            if (versionLabel.isNotBlank()) add(versionLabel)
            if (selected) add("当前版本")
        }.joinToString(" · ")
    return WorkbenchDeliverableFile(
        id = id,
        fileName = name,
        subtitle = subtitle.ifBlank { label },
        artifactId = id,
        versionNumber = versionNumber,
        isCurrent = selected || id == expectedCurrentId,
    )
}

@Composable
internal fun WorkbenchFilesPane(
    files: List<WorkbenchDeliverableFile>,
    restorePrompt: String? = null,
    onPreview: (WorkbenchDeliverableFile) -> Unit,
    onDownload: (WorkbenchDeliverableFile) -> Unit,
    onBeginRevision: (artifactId: String) -> Unit,
    onRequestRestore: ((restoreArtifactId: String, expectedCurrentArtifactId: String) -> Unit)? = null,
    expectedCurrentArtifactId: String? = null,
    modifier: Modifier = Modifier,
) {
    if (files.isEmpty()) {
        WorkbenchTabEmptyState(
            title = "暂无文件",
            message = "运行完成后，报告与导出文件会显示在这里。",
            modifier = modifier,
        )
        return
    }
    var menuFile by remember { mutableStateOf<WorkbenchDeliverableFile?>(null) }
    var anchorTopPx by remember { mutableFloatStateOf(0f) }
    var anchorHeightPx by remember { mutableFloatStateOf(0f) }
    val currentId = expectedCurrentArtifactId ?: files.firstOrNull { it.isCurrent }?.artifactId

    Box(modifier = modifier.fillMaxWidth().fillMaxHeight()) {
        Column(
            modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            if (!restorePrompt.isNullOrBlank()) {
                AppText(text = restorePrompt, style = AppTextStyle.Muted)
            }
            files.forEach { file ->
                WorkbenchDeliverableRow(
                    file = file,
                    onPreview = { onPreview(file) },
                    onOpenMenu = { topPx, heightPx ->
                        menuFile = file
                        anchorTopPx = topPx
                        anchorHeightPx = heightPx
                    },
                )
            }
        }
        WorkbenchFileContextMenu(
            target = menuFile,
            anchorTopPx = anchorTopPx,
            anchorHeightPx = anchorHeightPx,
            showRestore = menuFile?.let { !it.isCurrent && onRequestRestore != null && !currentId.isNullOrBlank() } == true,
            onDismiss = { menuFile = null },
            onModify = { file ->
                val id = file.artifactId.ifBlank { file.id }
                onBeginRevision(id)
                menuFile = null
            },
            onDownload = { file ->
                onDownload(file)
                menuFile = null
            },
            onRestore = { file ->
                val expected = currentId
                if (expected != null && onRequestRestore != null) {
                    val restoreId = file.artifactId.ifBlank { file.id }
                    onRequestRestore(restoreId, expected)
                }
                menuFile = null
            },
        )
    }
}

@Composable
private fun WorkbenchDeliverableRow(
    file: WorkbenchDeliverableFile,
    onPreview: () -> Unit,
    onOpenMenu: (anchorTopPx: Float, anchorHeightPx: Float) -> Unit,
) {
    val colors = LocalHarnessColors.current
    var menuAnchorTopPx by remember { mutableFloatStateOf(0f) }
    var menuAnchorHeightPx by remember { mutableFloatStateOf(0f) }
    Row(
        modifier =
            Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(HarnessLayout.panelRadius))
                .border(1.dp, colors.composerBorder, RoundedCornerShape(HarnessLayout.panelRadius))
                .background(colors.surface, RoundedCornerShape(HarnessLayout.panelRadius))
                .padding(start = 14.dp, end = 6.dp, top = 12.dp, bottom = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(
            modifier =
                Modifier
                    .weight(1f)
                    .clickable(onClick = onPreview),
        ) {
            AppText(text = file.fileName, style = AppTextStyle.Body)
            if (file.subtitle.isNotBlank()) {
                AppText(text = file.subtitle, style = AppTextStyle.Muted, modifier = Modifier.padding(top = 2.dp))
            }
        }
        HarnessIconButton(
            icon = Icons.Rounded.MoreVert,
            contentDescription = "更多操作",
            onClick = { onOpenMenu(menuAnchorTopPx, menuAnchorHeightPx) },
            modifier =
                Modifier.onGloballyPositioned { coords ->
                    menuAnchorTopPx = coords.positionInRoot().y
                    menuAnchorHeightPx = coords.size.height.toFloat()
                },
        )
    }
}

@Composable
private fun WorkbenchFileContextMenu(
    target: WorkbenchDeliverableFile?,
    anchorTopPx: Float,
    anchorHeightPx: Float,
    showRestore: Boolean,
    onDismiss: () -> Unit,
    onModify: (WorkbenchDeliverableFile) -> Unit,
    onDownload: (WorkbenchDeliverableFile) -> Unit,
    onRestore: (WorkbenchDeliverableFile) -> Unit,
) {
    if (target == null) return
    val colors = LocalHarnessColors.current
    val density = LocalDensity.current
    val reduceMotion = rememberHarnessReduceMotion()
    val menuProgress = remember { Animatable(0f) }
    LaunchedEffect(target.id) {
        menuProgress.snapTo(0f)
        if (reduceMotion) {
            menuProgress.animateTo(1f, tween(durationMillis = 160, easing = FastOutSlowInEasing))
        } else {
            menuProgress.animateTo(1f, spring(dampingRatio = 0.72f, stiffness = 420f))
        }
    }
    val menuWidth = 200.dp
    val gapPx = with(density) { 6.dp.toPx() }
    var menuTopPx = anchorTopPx + anchorHeightPx + gapPx
    val rowCount = 2 + if (showRestore) 1 else 0
    val menuHeightPx = with(density) { (rowCount * 44 + 8).dp.toPx() }
    BoxWithConstraints(Modifier.fillMaxSize()) {
        val maxHeightPx = with(density) { maxHeight.toPx() }
        if (menuTopPx + menuHeightPx > maxHeightPx - with(density) { 16.dp.toPx() }) {
            menuTopPx = (anchorTopPx - menuHeightPx - gapPx).coerceAtLeast(with(density) { 16.dp.toPx() })
        }
        val dismissInteraction = remember { MutableInteractionSource() }
        Box(
            modifier =
                Modifier
                    .fillMaxSize()
                    .clickable(
                        interactionSource = dismissInteraction,
                        indication = null,
                        onClick = onDismiss,
                    ),
        )
        Surface(
            modifier =
                Modifier
                    .offset { IntOffset(with(density) { 16.dp.roundToPx() }, menuTopPx.roundToInt()) }
                    .width(menuWidth)
                    .graphicsLayer {
                        val progress = menuProgress.value
                        alpha = progress
                        val scale = 0.82f + 0.18f * progress
                        scaleX = scale
                        scaleY = scale
                        transformOrigin = TransformOrigin(0f, 0f)
                        translationY = (1f - progress) * -12f
                    },
            shape = RoundedCornerShape(16.dp),
            color = colors.surface,
            shadowElevation = 0.dp,
            border = androidx.compose.foundation.BorderStroke(1.dp, colors.composerBorder),
        ) {
            Column(Modifier.padding(vertical = 4.dp)) {
                WorkbenchContextMenuRow(Icons.Rounded.Edit, "修改", colors.primary) {
                    onModify(target)
                }
                WorkbenchContextMenuRow(Icons.Rounded.Download, "下载", colors.primary) {
                    onDownload(target)
                }
                if (showRestore) {
                    AppDivider(modifier = Modifier.padding(horizontal = 12.dp, vertical = 4.dp))
                    WorkbenchContextMenuRow(Icons.Rounded.Restore, "恢复", colors.primary) {
                        onRestore(target)
                    }
                }
            }
        }
    }
}

@Composable
private fun WorkbenchContextMenuRow(
    icon: ImageVector,
    label: String,
    tint: Color,
    onClick: () -> Unit,
) {
    Row(
        modifier =
            Modifier
                .fillMaxWidth()
                .clickable(onClick = onClick)
                .padding(horizontal = 16.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(imageVector = icon, contentDescription = null, modifier = Modifier.size(18.dp), tint = tint)
        Text(
            text = label,
            color = tint,
            fontSize = 14.sp,
            fontWeight = FontWeight.Medium,
            modifier = Modifier.padding(start = 12.dp),
        )
    }
}
