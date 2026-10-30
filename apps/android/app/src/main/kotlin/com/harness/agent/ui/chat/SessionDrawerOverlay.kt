package com.harness.agent.ui.chat

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import com.harness.agent.coreui.motion.rememberHarnessReduceMotion
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Add
import androidx.compose.material.icons.rounded.Delete
import androidx.compose.material.icons.rounded.Edit
import androidx.compose.material.icons.rounded.PushPin
import androidx.compose.material.icons.rounded.Settings
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.sp
import com.harness.agent.coreui.tokens.HarnessLayout
import com.harness.agent.coreui.tokens.LocalContentFontSizeSp
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.layout.positionInRoot
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.TransformOrigin
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.dp
import com.harness.agent.coreui.motion.harnessPressOpacity
import com.harness.agent.coreui.feedback.AppConfirmDialog
import com.harness.agent.coreui.feedback.AppConfirmRequest
import com.harness.agent.coreui.feedback.HarnessModalActionRow
import com.harness.agent.coreui.feedback.HarnessModalDialog
import com.harness.agent.coreui.primitives.AppDivider
import com.harness.agent.coreui.primitives.AppText
import com.harness.agent.coreui.primitives.AppTextStyle
import com.harness.agent.coreui.primitives.SettingsTextField
import com.harness.agent.coreui.tokens.LocalHarnessColors
import com.harness.agent.model.SessionDrawerItem
import kotlin.math.roundToInt

private const val PANEL_WIDTH_RATIO = 0.78f
private const val MOTION_MS = 280

@OptIn(ExperimentalFoundationApi::class)
@Composable
fun SessionDrawerOverlay(
    visible: Boolean,
    sessions: List<SessionDrawerItem>,
    refreshing: Boolean,
    menuTarget: SessionDrawerItem?,
    onClose: () -> Unit,
    onNewConversation: () -> Unit,
    newConversationEnabled: Boolean = true,
    onRefresh: () -> Unit,
    onSelectSession: (String) -> Unit,
    onLongPressSession: (SessionDrawerItem) -> Unit,
    onDismissMenu: () -> Unit,
    onRenameSession: (String, String) -> Unit,
    onTogglePin: (String) -> Unit,
    onDeleteSession: (String) -> Unit,
    onOpenSettings: () -> Unit,
    previewReduceMotion: Boolean = false,
) {
    val reduceMotion = rememberHarnessReduceMotion(previewReduceMotion)
    val motionMs = if (reduceMotion) 150 else MOTION_MS

    val panelProgress by animateFloatAsState(
        targetValue = if (visible) 1f else 0f,
        animationSpec =
            if (reduceMotion) {
                tween(durationMillis = motionMs)
            } else {
                tween(durationMillis = MOTION_MS, easing = FastOutSlowInEasing)
            },
        label = "drawerSlide",
    )

    val scrimAlpha by animateFloatAsState(
        targetValue = if (visible) 1f else 0f,
        animationSpec = tween(durationMillis = motionMs),
        label = "drawerScrim",
    )

    var menuAnchorTopPx by remember { mutableFloatStateOf(0f) }
    var menuAnchorHeightPx by remember { mutableFloatStateOf(0f) }
    var renameDialogTarget by remember { mutableStateOf<SessionDrawerItem?>(null) }
    var renameDraft by remember(renameDialogTarget?.id) { mutableStateOf(renameDialogTarget?.title.orEmpty()) }

    if (panelProgress <= 0.01f && !visible && menuTarget == null) {
        return
    }

    BoxWithConstraints(Modifier.fillMaxSize()) {
        val density = LocalDensity.current
        val panelWidth = maxWidth * PANEL_WIDTH_RATIO
        val panelWidthPx = with(density) { panelWidth.toPx() }
        val offsetX =
            if (reduceMotion) {
                0
            } else {
                (-panelWidthPx * (1f - panelProgress)).roundToInt()
            }

        Box(
            modifier =
                Modifier
                    .fillMaxSize()
                    .background(Color.Black.copy(alpha = HarnessLayout.overlayScrimAlpha * scrimAlpha))
                    .clickable(onClick = onClose),
        )

        Surface(
            modifier =
                Modifier
                    .fillMaxHeight()
                    .width(panelWidth)
                    .offset { IntOffset(offsetX, 0) }
                    .graphicsLayer {
                        if (reduceMotion) {
                            alpha = panelProgress
                        }
                    }
                    .border(
                        width = 1.dp,
                        color = LocalHarnessColors.current.composerBorder,
                    ),
            color = LocalHarnessColors.current.drawer,
            shadowElevation = 8.dp,
        ) {
            DrawerPanelContent(
                sessions = sessions,
                refreshing = refreshing,
                menuHighlightId = menuTarget?.id,
                onNewConversation = onNewConversation,
                newConversationEnabled = newConversationEnabled,
                onRefresh = onRefresh,
                onSelectSession = onSelectSession,
                onLongPressSession = { item, topPx, heightPx ->
                    menuAnchorTopPx = topPx
                    menuAnchorHeightPx = heightPx
                    onLongPressSession(item)
                },
                onOpenSettings = onOpenSettings,
            )
        }
    }

    var deleteConfirm by remember { mutableStateOf<AppConfirmRequest?>(null) }

    SessionDrawerContextMenu(
        target = menuTarget,
        anchorTopPx = menuAnchorTopPx,
        anchorHeightPx = menuAnchorHeightPx,
        onDismiss = onDismissMenu,
        onRename = { item ->
            onDismissMenu()
            renameDialogTarget = item
            renameDraft = item.title
        },
        onTogglePin = onTogglePin,
        onRequestDelete = { id, title ->
            onDismissMenu()
            deleteConfirm =
                AppConfirmRequest(
                    title = "删除会话",
                    message = "确定删除「$title」？Preview 中仅从侧栏列表移除。",
                    confirmLabel = "删除",
                    destructive = true,
                    onConfirm = { onDeleteSession(id) },
                )
        },
    )

    AppConfirmDialog(request = deleteConfirm, onDismiss = { deleteConfirm = null })

    renameDialogTarget?.let { target ->
        SessionRenameDialog(
            draft = renameDraft,
            onDraftChange = { renameDraft = it },
            onDismiss = { renameDialogTarget = null },
            onSave = {
                onRenameSession(target.id, renameDraft.ifBlank { target.title })
                renameDialogTarget = null
            },
        )
    }
}

@Composable
private fun SessionRenameDialog(
    draft: String,
    onDraftChange: (String) -> Unit,
    onDismiss: () -> Unit,
    onSave: () -> Unit,
) {
    val colors = LocalHarnessColors.current
    HarnessModalDialog(onDismiss = onDismiss) {
        Text(
            text = "重命名会话",
            color = colors.secondary,
            fontWeight = FontWeight.SemiBold,
            fontSize = 15.sp,
        )
        Spacer(Modifier.height(12.dp))
        SettingsTextField(
            value = draft,
            onValueChange = onDraftChange,
            label = "会话标题",
            placeholder = "输入标题",
        )
        HarnessModalActionRow(
            dismissLabel = "取消",
            onDismiss = onDismiss,
            confirmLabel = "保存",
            onConfirm = onSave,
            confirmEnabled = draft.isNotBlank(),
        )
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun DrawerPanelContent(
    sessions: List<SessionDrawerItem>,
    refreshing: Boolean,
    menuHighlightId: String? = null,
    onNewConversation: () -> Unit,
    newConversationEnabled: Boolean = true,
    onRefresh: () -> Unit,
    onSelectSession: (String) -> Unit,
    onLongPressSession: (SessionDrawerItem, Float, Float) -> Unit,
    onOpenSettings: () -> Unit,
) {
    val colors = LocalHarnessColors.current
    val contentFont = LocalContentFontSizeSp.current.coerceIn(13, 20)
    val pinned = sessions.filter { it.pinned }
    val recent = sessions.filter { !it.pinned }
    Column(
        modifier =
            Modifier
                .fillMaxSize()
                .statusBarsPadding(),
    ) {
        Column(
            modifier =
                Modifier
                    .weight(1f)
                    .padding(horizontal = 16.dp)
                    .padding(top = 12.dp),
        ) {
            NewConversationButton(
                contentFontSp = contentFont,
                enabled = newConversationEnabled,
                onClick = onNewConversation,
            )
            PullToRefreshBox(
                isRefreshing = refreshing,
                onRefresh = onRefresh,
                modifier = Modifier.weight(1f).padding(top = 12.dp),
            ) {
                LazyColumn(modifier = Modifier.fillMaxSize()) {
                    if (pinned.isNotEmpty()) {
                        item {
                            AppText(
                                text = "置顶",
                                style = AppTextStyle.Muted,
                                modifier = Modifier.padding(start = 4.dp, bottom = 4.dp, top = 4.dp),
                            )
                        }
                        items(pinned, key = { it.id }) { item ->
                            SessionDrawerRow(
                                item = item,
                                menuHighlighted = item.id == menuHighlightId,
                                onSelect = onSelectSession,
                                onLongPress = onLongPressSession,
                            )
                        }
                    }
                    item {
                        AppText(
                            text = "最近",
                            style = AppTextStyle.Muted,
                            modifier = Modifier.padding(start = 4.dp, bottom = 4.dp, top = 4.dp),
                        )
                    }
                    items(recent, key = { it.id }) { item ->
                        SessionDrawerRow(
                            item = item,
                            menuHighlighted = item.id == menuHighlightId,
                            onSelect = onSelectSession,
                            onLongPress = onLongPressSession,
                        )
                    }
                }
            }
        }
        Column(
            modifier =
                Modifier
                    .fillMaxWidth()
                    .border(width = 1.dp, color = colors.composerBorder)
                    .navigationBarsPadding()
                    .padding(horizontal = 16.dp)
                    .padding(top = 8.dp, bottom = 12.dp),
        ) {
            Row(
                modifier =
                    Modifier
                        .fillMaxWidth()
                        .heightIn(min = 48.dp)
                        .clip(RoundedCornerShape(HarnessLayout.panelRadius))
                        .clickable(onClick = onOpenSettings)
                        .padding(horizontal = 4.dp, vertical = 8.dp)
                        .testTag("session-drawer-settings"),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Icon(
                    imageVector = Icons.Rounded.Settings,
                    contentDescription = null,
                    modifier = Modifier.size(20.dp),
                    tint = colors.secondary,
                )
                Text(
                    text = "设置",
                    color = colors.primary,
                    fontSize = (contentFont - 1).sp,
                    fontWeight = FontWeight.Medium,
                    modifier = Modifier.padding(start = 10.dp),
                )
            }
        }
    }
}

@Composable
private fun NewConversationButton(
    contentFontSp: Int,
    enabled: Boolean = true,
    onClick: () -> Unit,
) {
    val colors = LocalHarnessColors.current
    val interactionSource = remember { MutableInteractionSource() }
    Row(
        modifier =
            Modifier
                .fillMaxWidth()
                .heightIn(min = HarnessLayout.settingsRowMinHeight)
                .clip(RoundedCornerShape(HarnessLayout.controlRadius))
                .border(1.dp, colors.composerBorder, RoundedCornerShape(HarnessLayout.controlRadius))
                .background(colors.subtle)
                .harnessPressOpacity(interactionSource = interactionSource)
                .semantics { contentDescription = "新建对话" }
                .clickable(
                    enabled = enabled,
                    interactionSource = interactionSource,
                    indication = null,
                    onClick = onClick,
                )
                .graphicsLayer { alpha = if (enabled) 1f else 0.45f }
                .padding(start = 10.dp, end = 12.dp, top = 10.dp, bottom = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(
            imageVector = Icons.Rounded.Add,
            contentDescription = null,
            modifier = Modifier.size(20.dp),
            tint = colors.primary,
        )
        Text(
            text = "新对话",
            color = colors.primary,
            fontSize = contentFontSp.sp,
            fontWeight = FontWeight.SemiBold,
            modifier = Modifier.padding(start = 10.dp),
        )
    }
}

@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun SessionDrawerRow(
    item: SessionDrawerItem,
    menuHighlighted: Boolean = false,
    onSelect: (String) -> Unit,
    onLongPress: (SessionDrawerItem, Float, Float) -> Unit,
) {
    val colors = LocalHarnessColors.current
    val contentFont = LocalContentFontSizeSp.current.coerceIn(13, 20)
    var rowTopPx by remember(item.id) { mutableFloatStateOf(0f) }
    var rowHeightPx by remember(item.id) { mutableFloatStateOf(0f) }
    val rowBackground =
        when {
            menuHighlighted -> colors.surface
            item.active -> colors.surfaceHover
            else -> Color.Transparent
        }
    Row(
        modifier =
            Modifier
                .fillMaxWidth()
                .padding(bottom = 2.dp)
                .heightIn(min = 48.dp)
                .onGloballyPositioned { coords ->
                    rowTopPx = coords.positionInRoot().y
                    rowHeightPx = coords.size.height.toFloat()
                }
                .clip(RoundedCornerShape(HarnessLayout.panelRadius))
                .background(rowBackground)
                .combinedClickable(
                    onClick = { onSelect(item.id) },
                    onLongClick = { onLongPress(item, rowTopPx, rowHeightPx) },
                )
                .padding(horizontal = 12.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        if (item.running) {
            Box(
                modifier =
                    Modifier
                        .size(8.dp)
                        .clip(CircleShape)
                        .background(colors.approvalText),
            )
            Spacer(Modifier.width(8.dp))
        }
        Text(
            text = item.title,
            color = colors.primary,
            fontSize = (contentFont - 1).sp,
            fontWeight = if (item.active) FontWeight.SemiBold else FontWeight.Medium,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.weight(1f),
        )
        if (item.time.isNotBlank()) {
            Text(
                text = item.time,
                color = colors.muted,
                fontSize = 12.sp,
                modifier = Modifier.padding(start = 8.dp),
            )
        }
    }
}

@Composable
private fun SessionDrawerContextMenu(
    target: SessionDrawerItem?,
    anchorTopPx: Float,
    anchorHeightPx: Float,
    onDismiss: () -> Unit,
    onRename: (SessionDrawerItem) -> Unit,
    onTogglePin: (String) -> Unit,
    onRequestDelete: (String, String) -> Unit,
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
    val menuHeightPx = with(density) { 168.dp.toPx() }
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
            tonalElevation = 0.dp,
            border = androidx.compose.foundation.BorderStroke(1.dp, colors.composerBorder),
        ) {
            Column(Modifier.padding(vertical = 4.dp)) {
                ContextMenuRow(Icons.Rounded.Edit, "重命名", colors.primary) {
                    onRename(target)
                }
                ContextMenuRow(
                    Icons.Rounded.PushPin,
                    if (target.pinned) "取消置顶" else "置顶",
                    colors.primary,
                ) {
                    onTogglePin(target.id)
                    onDismiss()
                }
                AppDivider(modifier = Modifier.padding(horizontal = 12.dp, vertical = 4.dp))
                ContextMenuRow(Icons.Rounded.Delete, "删除", colors.danger) {
                    onRequestDelete(target.id, target.title)
                }
            }
        }
    }
}

@Composable
private fun ContextMenuRow(
    icon: androidx.compose.ui.graphics.vector.ImageVector,
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
