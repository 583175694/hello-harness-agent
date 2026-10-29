package com.harness.agent.ui.workbench

import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Close
import androidx.compose.material3.Icon
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp
import com.harness.agent.coreui.primitives.HarnessIconButton
import com.harness.agent.coreui.primitives.HarnessIconButtonShape
import com.harness.agent.coreui.tokens.HarnessLayout
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import com.harness.agent.coreui.motion.rememberHarnessReduceMotion
import androidx.compose.animation.core.tween
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.runtime.DisposableEffect
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.window.DialogWindowProvider
import androidx.core.view.WindowCompat
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import com.harness.agent.coreui.markdown.MarkdownBody
import com.harness.agent.coreui.primitives.AppText
import com.harness.agent.coreui.primitives.AppTextStyle
import com.harness.agent.coreui.primitives.HarnessSegmentedControl
import com.harness.agent.coreui.tokens.LocalHarnessColors
import com.harness.agent.coreui.primitives.AppButton
import com.harness.agent.coreui.primitives.AppSheet
import com.harness.agent.model.WorkbenchSourceCard
import com.harness.agent.model.WorkbenchState

private val DETENTS = listOf(0.44f, 0.72f, 0.98f)
private val TABS = listOf("activity", "artifact")
private const val SHEET_MOTION_MS = 280

@Composable
fun WorkbenchSheetOverlay(
    visible: Boolean,
    state: WorkbenchState,
    onDismiss: () -> Unit,
    onOpenReportReader: (() -> Unit)? = null,
    onOpenArtifactReader: (() -> Unit)? = null,
    onOpenFilePreview: ((fileName: String, markdown: String) -> Unit)? = null,
    initialFocusedToolId: String? = null,
    previewReduceMotion: Boolean = false,
) {
    val colors = LocalHarnessColors.current
    val reduceMotion = rememberHarnessReduceMotion(previewReduceMotion)
    var detentIndex by rememberSaveable(state.initialSheetIndex, state.workbenchCount) {
        mutableIntStateOf(state.resolvedInitialDetent())
    }
    var activeTab by rememberSaveable(state.initialView) { mutableStateOf(state.initialView.ifBlank { "activity" }) }
    LaunchedEffect(initialFocusedToolId) {
        if (!initialFocusedToolId.isNullOrBlank()) {
            activeTab = "activity"
        }
    }
    LaunchedEffect(visible, state.initialSheetIndex, state.workbenchCount) {
        if (visible) {
            detentIndex = state.resolvedInitialDetent()
        }
    }
    var passageCard by remember { mutableStateOf<WorkbenchSourceCard?>(null) }
    val heightFraction by animateFloatAsState(
        targetValue = DETENTS[detentIndex],
        animationSpec = if (reduceMotion) tween(0) else tween(SHEET_MOTION_MS),
        label = "wbDetent",
    )
    val sheetProgress by animateFloatAsState(
        targetValue = if (visible) 1f else 0f,
        animationSpec =
            if (reduceMotion) {
                tween(durationMillis = 0)
            } else {
                tween(durationMillis = SHEET_MOTION_MS, easing = FastOutSlowInEasing)
            },
        label = "wbPresent",
    )

    if (sheetProgress <= 0.01f && !visible) {
        return
    }

    Dialog(
        onDismissRequest = onDismiss,
        properties =
            DialogProperties(
                usePlatformDefaultWidth = false,
                decorFitsSystemWindows = false,
            ),
    ) {
        val dialogView = LocalView.current
        DisposableEffect(dialogView) {
            val window = (dialogView.parent as? DialogWindowProvider)?.window
            if (window != null) {
                WindowCompat.setDecorFitsSystemWindows(window, false)
            }
            onDispose { }
        }
    Box(modifier = Modifier.fillMaxSize()) {
        Box(
            modifier =
                Modifier
                    .fillMaxSize()
                    .background(Color.Black.copy(alpha = HarnessLayout.overlayScrimAlpha * sheetProgress))
                    .clickable(onClick = onDismiss),
        )
        val sheetShape =
            RoundedCornerShape(topStart = HarnessLayout.sheetTopRadius, topEnd = HarnessLayout.sheetTopRadius)
        Surface(
            modifier =
                Modifier
                    .align(Alignment.BottomCenter)
                    .fillMaxWidth()
                    .fillMaxHeight(heightFraction)
                    .clip(sheetShape)
                    .graphicsLayer {
                        translationY = (1f - sheetProgress) * size.height
                        alpha = sheetProgress
                    },
            shape = sheetShape,
            color = colors.surface,
            shadowElevation = 16.dp,
        ) {
            Column(
                modifier =
                    Modifier
                        .fillMaxSize()
                        .border(
                            width = 1.dp,
                            color = colors.composerBorder,
                            shape = RoundedCornerShape(topStart = HarnessLayout.sheetTopRadius, topEnd = HarnessLayout.sheetTopRadius),
                        ),
            ) {
                Box(
                    modifier =
                        Modifier
                            .fillMaxWidth()
                            .height(24.dp)
                            .clickable {
                                detentIndex = (detentIndex + 1) % DETENTS.size
                            },
                    contentAlignment = Alignment.Center,
                ) {
                    Box(
                        modifier =
                            Modifier
                                .size(width = HarnessLayout.workbenchHandleWidth, height = HarnessLayout.workbenchHandleHeight)
                                .background(colors.border, RoundedCornerShape(2.dp)),
                    )
                }
                Row(
                    modifier =
                        Modifier
                            .fillMaxWidth()
                            .padding(horizontal = 16.dp, vertical = 4.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(
                        text = "工作台",
                        color = colors.primary,
                        fontSize = 15.sp,
                        fontWeight = FontWeight.SemiBold,
                        modifier = Modifier.weight(1f),
                    )
                    HarnessIconButton(
                        icon = Icons.Rounded.Close,
                        contentDescription = "关闭工作台",
                        onClick = onDismiss,
                        shape = HarnessIconButtonShape.Circle,
                        iconSizeDp = 20,
                    )
                }
                WorkbenchSegmentedTabs(
                    activeTab = activeTab,
                    onTabSelected = { activeTab = it },
                )
                WorkbenchTabContent(
                    activeTab = activeTab,
                    state = state,
                    initialFocusedToolId = initialFocusedToolId,
                    modifier =
                        Modifier
                            .weight(1f)
                            .fillMaxWidth()
                            .fillMaxHeight(),
                    onOpenFilePreview = { file ->
                        val md = file.previewMarkdown ?: "# ${file.fileName}\n\n（Preview 文件预览）"
                        onOpenFilePreview?.invoke(file.fileName, md)
                            ?: onOpenArtifactReader?.invoke()
                    },
                )
            }
        }
    }
    }

    WorkbenchPassageSheet(
        card = passageCard,
        onDismiss = { passageCard = null },
    )

}

@Composable
internal fun WorkbenchRestoreConfirmSheet(
    visible: Boolean,
    prompt: String?,
    onDismiss: () -> Unit,
    onConfirm: () -> Unit,
) {
    AppSheet(
        visible = visible,
        onDismiss = onDismiss,
        title = "恢复版本",
    ) {
        AppText(
            text = prompt ?: "将恢复所选版本（Preview 静态确认，不写入服务器）。",
            style = AppTextStyle.Body,
        )
        AppButton(text = "确认恢复", onClick = onConfirm)
    }
}

private fun WorkbenchState.resolvedInitialDetent(): Int {
    val emptyShell =
        workbenchCount == 0 &&
            toolExecutions.isEmpty() &&
            activityTimeline.isEmpty() &&
            bashSnippet.isNullOrBlank() &&
            sources.isEmpty() &&
            deliverableFiles.isEmpty() &&
            artifactVersions.isEmpty()
    return if (emptyShell) 1 else initialSheetIndex.coerceIn(0, 2)
}

@Composable
private fun WorkbenchSegmentedTabs(
    activeTab: String,
    onTabSelected: (String) -> Unit,
) {
    HarnessSegmentedControl(
        segments = TABS.map { it to WorkbenchTabLabels.label(it) },
        selectedId = activeTab,
        onSelected = onTabSelected,
        modifier = Modifier.padding(horizontal = 12.dp, vertical = 6.dp),
    )
}

@Composable
private fun WorkbenchTabContent(
    activeTab: String,
    state: WorkbenchState,
    initialFocusedToolId: String? = null,
    modifier: Modifier = Modifier,
    onOpenFilePreview: (com.harness.agent.model.WorkbenchDeliverableFile) -> Unit,
) {
    when (activeTab) {
        "activity" ->
            WorkbenchActivityFollowPane(
                state = state,
                modifier = modifier,
                initialStepId = initialFocusedToolId,
            )
        "artifact" ->
            WorkbenchFilesPane(
                files = state.deliverableFiles,
                onPreview = onOpenFilePreview,
                modifier = modifier,
            )
        else ->
            WorkbenchActivityFollowPane(
                state = state,
                modifier = modifier,
            )
    }
}

@Composable
internal fun WorkbenchPassageSheet(
    card: WorkbenchSourceCard?,
    onDismiss: () -> Unit,
) {
    if (card == null || card.passageBody.isNullOrBlank()) return
    AppSheet(
        visible = true,
        onDismiss = onDismiss,
        title = card.title,
    ) {
        card.passageHeading?.let {
            AppText(text = it, style = AppTextStyle.Muted)
        }
        AppText(text = card.passageBody, style = AppTextStyle.Body, modifier = Modifier.padding(top = 8.dp))
    }
}
