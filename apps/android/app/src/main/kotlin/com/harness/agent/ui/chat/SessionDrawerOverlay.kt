package com.harness.agent.ui.chat

import android.provider.Settings
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.combinedClickable
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
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material3.Icon
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextField
import androidx.compose.material3.TextFieldDefaults
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
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.dp
import com.harness.agent.coreui.primitives.AppDivider
import com.harness.agent.coreui.primitives.AppSheet
import com.harness.agent.coreui.primitives.AppText
import com.harness.agent.coreui.primitives.AppTextField
import com.harness.agent.coreui.primitives.AppTextStyle
import com.harness.agent.coreui.primitives.Spinner
import com.harness.agent.coreui.tokens.LocalHarnessColors
import com.harness.agent.model.SessionDrawerItem
import kotlin.math.roundToInt

private const val PANEL_WIDTH_RATIO = 0.78f
private const val MOTION_MS = 280

@OptIn(ExperimentalFoundationApi::class)
@Composable
fun SessionDrawerOverlay(
    visible: Boolean,
    draftTitle: String,
    searchPlaceholder: String,
    sessions: List<SessionDrawerItem>,
    refreshing: Boolean,
    menuTarget: SessionDrawerItem?,
    onClose: () -> Unit,
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
    val context = LocalContext.current
    val systemReduceMotion =
        remember {
            try {
                Settings.Global.getFloat(context.contentResolver, Settings.Global.TRANSITION_ANIMATION_SCALE) == 0f
            } catch (_: Exception) {
                false
            }
        }
    val reduceMotion = previewReduceMotion || systemReduceMotion

    val panelProgress by animateFloatAsState(
        targetValue = if (visible) 1f else 0f,
        animationSpec =
            if (reduceMotion) {
                tween(durationMillis = 120)
            } else {
                tween(durationMillis = MOTION_MS, easing = FastOutSlowInEasing)
            },
        label = "drawerSlide",
    )

    val scrimAlpha by animateFloatAsState(
        targetValue = if (visible) 1f else 0f,
        animationSpec = tween(durationMillis = if (reduceMotion) 120 else MOTION_MS),
        label = "drawerScrim",
    )

    if (panelProgress <= 0.01f && !visible && menuTarget == null) {
        return
    }

    BoxWithConstraints(Modifier.fillMaxSize()) {
        val density = LocalDensity.current
        val panelWidth = maxWidth * PANEL_WIDTH_RATIO
        val panelWidthPx = with(density) { panelWidth.toPx() }
        val offsetX =
            if (reduceMotion && panelProgress >= 1f) {
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
                    .border(
                        width = 1.dp,
                        color = LocalHarnessColors.current.composerBorder,
                    ),
            color = LocalHarnessColors.current.drawer,
            shadowElevation = 8.dp,
        ) {
            DrawerPanelContent(
                drawerVisible = visible,
                draftTitle = draftTitle,
                searchPlaceholder = searchPlaceholder,
                sessions = sessions,
                refreshing = refreshing,
                onClose = onClose,
                onRefresh = onRefresh,
                onSelectSession = onSelectSession,
                onLongPressSession = onLongPressSession,
                onOpenSettings = onOpenSettings,
            )
        }
    }

    SessionDrawerContextMenu(
        target = menuTarget,
        onDismiss = onDismissMenu,
        onRename = onRenameSession,
        onTogglePin = onTogglePin,
        onDelete = onDeleteSession,
    )
}

@Composable
private fun DrawerPanelContent(
    drawerVisible: Boolean,
    draftTitle: String,
    searchPlaceholder: String,
    sessions: List<SessionDrawerItem>,
    refreshing: Boolean,
    onClose: () -> Unit,
    onRefresh: () -> Unit,
    onSelectSession: (String) -> Unit,
    onLongPressSession: (SessionDrawerItem) -> Unit,
    onOpenSettings: () -> Unit,
) {
    val colors = LocalHarnessColors.current
    val contentFont = LocalContentFontSizeSp.current.coerceIn(13, 20)
    var query by remember { mutableStateOf("") }
    LaunchedEffect(drawerVisible) {
        if (!drawerVisible) {
            query = ""
        }
    }
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
            Row(
                modifier =
                    Modifier
                        .fillMaxWidth()
                        .heightIn(min = 48.dp)
                        .clip(RoundedCornerShape(HarnessLayout.panelRadius))
                        .background(colors.surface)
                        .clickable(onClick = onClose)
                        .padding(horizontal = 8.dp, vertical = 10.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Icon(
                    imageVector = Icons.Filled.Add,
                    contentDescription = null,
                    modifier = Modifier.size(20.dp),
                    tint = colors.primary,
                )
                Text(
                    text = "新对话",
                    color = colors.primary,
                    fontSize = contentFont.sp,
                    fontWeight = FontWeight.SemiBold,
                    modifier = Modifier.padding(start = 8.dp),
                )
            }
            Box(modifier = Modifier.fillMaxWidth().padding(top = 12.dp, bottom = 12.dp)) {
                TextField(
                    value = query,
                    onValueChange = { query = it },
                    modifier = Modifier.fillMaxWidth(),
                    placeholder = {
                        Text(text = searchPlaceholder, color = colors.composerPlaceholder, fontSize = 13.sp)
                    },
                    leadingIcon = {
                        Icon(
                            imageVector = Icons.Filled.Search,
                            contentDescription = null,
                            modifier = Modifier.size(16.dp),
                            tint = colors.muted,
                        )
                    },
                    singleLine = true,
                    textStyle =
                        androidx.compose.ui.text.TextStyle(
                            fontSize = 13.sp,
                            color = colors.primary,
                        ),
                    colors =
                        TextFieldDefaults.colors(
                            focusedContainerColor = colors.subtle,
                            unfocusedContainerColor = colors.subtle,
                            disabledContainerColor = colors.subtle,
                            focusedIndicatorColor = Color.Transparent,
                            unfocusedIndicatorColor = Color.Transparent,
                            cursorColor = colors.primary,
                        ),
                    shape = RoundedCornerShape(HarnessLayout.controlRadius),
                )
            }
            Row(
                modifier = Modifier.padding(bottom = 4.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                AppText(text = "刷新列表", style = AppTextStyle.Muted)
                Spacer(Modifier.width(8.dp))
                if (refreshing) {
                    Spinner(modifier = Modifier.size(20.dp))
                } else {
                    Box(
                        modifier =
                            Modifier
                                .clip(RoundedCornerShape(HarnessLayout.controlRadius))
                                .clickable(onClick = onRefresh)
                                .padding(4.dp),
                    ) {
                        AppText(text = "↻", style = AppTextStyle.Body)
                    }
                }
            }
            val filtered =
                if (query.isBlank()) {
                    sessions
                } else {
                    sessions.filter { it.title.contains(query, ignoreCase = true) }
                }
            val pinned = filtered.filter { it.pinned }
            val recent = filtered.filter { !it.pinned }
            LazyColumn(modifier = Modifier.weight(1f)) {
                item {
                    Box(
                        modifier =
                            Modifier
                                .fillMaxWidth()
                                .padding(bottom = 4.dp)
                                .heightIn(min = 44.dp)
                                .clip(RoundedCornerShape(HarnessLayout.controlRadius))
                                .background(colors.surfaceHover)
                                .padding(horizontal = 12.dp, vertical = 10.dp),
                    ) {
                        Text(
                            text = draftTitle,
                            color = colors.primary,
                            fontSize = (contentFont - 1).sp,
                            fontWeight = FontWeight.SemiBold,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                        )
                    }
                }
                if (pinned.isNotEmpty()) {
                    item {
                        AppText(
                            text = "置顶",
                            style = AppTextStyle.Muted,
                            modifier = Modifier.padding(start = 4.dp, bottom = 4.dp, top = 4.dp),
                        )
                    }
                    items(pinned, key = { it.id }) { item ->
                        SessionDrawerRow(item, onSelectSession, onLongPressSession)
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
                    SessionDrawerRow(item, onSelectSession, onLongPressSession)
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
                    imageVector = Icons.Filled.Settings,
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

@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun SessionDrawerRow(
    item: SessionDrawerItem,
    onSelect: (String) -> Unit,
    onLongPress: (SessionDrawerItem) -> Unit,
) {
    val colors = LocalHarnessColors.current
    val contentFont = LocalContentFontSizeSp.current.coerceIn(13, 20)
    Row(
        modifier =
            Modifier
                .fillMaxWidth()
                .padding(bottom = 2.dp)
                .heightIn(min = 48.dp)
                .clip(RoundedCornerShape(HarnessLayout.panelRadius))
                .background(if (item.active) colors.surfaceHover else Color.Transparent)
                .combinedClickable(
                    onClick = { onSelect(item.id) },
                    onLongClick = { onLongPress(item) },
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
        Text(
            text = item.time,
            color = colors.muted,
            fontSize = 12.sp,
            modifier = Modifier.padding(start = 8.dp),
        )
    }
}

@Composable
private fun SessionDrawerContextMenu(
    target: SessionDrawerItem?,
    onDismiss: () -> Unit,
    onRename: (String, String) -> Unit,
    onTogglePin: (String) -> Unit,
    onDelete: (String) -> Unit,
) {
    var renameDraft by remember(target?.id) { mutableStateOf(target?.title.orEmpty()) }
    AppSheet(
        visible = target != null,
        onDismiss = onDismiss,
        title = target?.title ?: "会话",
    ) {
        if (target == null) return@AppSheet
        AppTextField(value = renameDraft, onValueChange = { renameDraft = it }, label = "重命名")
        Spacer(Modifier.height(8.dp))
        AppDivider()
        ListRowAction("重命名") { onRename(target.id, renameDraft.ifBlank { target.title }) }
        ListRowAction(if (target.pinned) "取消置顶" else "置顶") { onTogglePin(target.id) }
        ListRowAction("删除会话") { onDelete(target.id) }
    }
}

@Composable
private fun ListRowAction(
    label: String,
    onClick: () -> Unit,
) {
    Box(
        modifier =
            Modifier
                .fillMaxWidth()
                .clickable(onClick = onClick)
                .padding(vertical = 12.dp),
    ) {
        AppText(text = label, style = AppTextStyle.Body, modifier = Modifier.padding(start = 4.dp))
    }
}
