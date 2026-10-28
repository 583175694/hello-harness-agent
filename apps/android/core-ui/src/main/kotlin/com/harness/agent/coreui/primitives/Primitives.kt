package com.harness.agent.coreui.primitives

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.asPaddingValues
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Text
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.harness.agent.coreui.tokens.LocalContentFontSizeSp
import com.harness.agent.coreui.tokens.LocalHarnessColors

@Composable
fun AppScaffold(
    modifier: Modifier = Modifier,
    topBar: @Composable () -> Unit = {},
    content: @Composable ColumnScope.() -> Unit,
) {
    val colors = LocalHarnessColors.current
    Column(
        modifier =
            modifier
                .fillMaxSize()
                .background(colors.canvas)
                .statusBarsPadding()
                .navigationBarsPadding(),
    ) {
        topBar()
        Column(
            modifier =
                Modifier
                    .weight(1f)
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp),
            content = content,
        )
    }
}

@Composable
fun AppTopBar(
    title: String,
    modifier: Modifier = Modifier,
    useCanvasBackground: Boolean = false,
    trailing: @Composable RowScope.() -> Unit = {},
) {
    val colors = LocalHarnessColors.current
    Row(
        modifier =
            modifier
                .fillMaxWidth()
                .height(48.dp)
                .background(if (useCanvasBackground) colors.canvas else colors.surface)
                .padding(horizontal = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        AppText(text = title, style = AppTextStyle.Title, modifier = Modifier.weight(1f))
        trailing()
    }
    AppDivider()
}

enum class AppTextStyle {
    Title,
    Body,
    Caption,
    Muted,
    Link,
}

@Composable
fun AppText(
    text: String,
    modifier: Modifier = Modifier,
    style: AppTextStyle = AppTextStyle.Body,
    tabularNums: Boolean = false,
) {
    val colors = LocalHarnessColors.current
    val base = LocalContentFontSizeSp.current.coerceIn(13, 20)
    val (color, weight, size) =
        when (style) {
            AppTextStyle.Title -> Triple(colors.primary, FontWeight.SemiBold, (base + 2).sp)
            AppTextStyle.Body -> Triple(colors.primary, FontWeight.Normal, base.sp)
            AppTextStyle.Caption -> Triple(colors.secondary, FontWeight.Normal, (base - 2).coerceAtLeast(11).sp)
            AppTextStyle.Muted -> Triple(colors.muted, FontWeight.Normal, (base - 2).coerceAtLeast(11).sp)
            AppTextStyle.Link -> Triple(colors.link, FontWeight.Normal, (base - 2).coerceAtLeast(11).sp)
        }
    Text(
        text = text,
        modifier = modifier,
        style =
            androidx.compose.ui.text.TextStyle(
                color = color,
                fontWeight = weight,
                fontSize = size,
                fontFeatureSettings = if (tabularNums) "tnum" else null,
            ),
    )
}

@Composable
fun AppButton(
    text: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
) {
    val colors = LocalHarnessColors.current
    Button(
        onClick = onClick,
        enabled = enabled,
        modifier =
            modifier
                .height(40.dp)
                .semantics { contentDescription = text },
        colors =
            ButtonDefaults.buttonColors(
                containerColor = colors.primary,
                contentColor = colors.primaryForeground,
            ),
        shape = RoundedCornerShape(com.harness.agent.coreui.tokens.HarnessLayout.controlRadius),
    ) {
        val base = LocalContentFontSizeSp.current.coerceIn(13, 20)
        Text(text = text, color = colors.primaryForeground, fontSize = base.sp)
    }
}

@Composable
fun AppIcon(
    label: String,
    modifier: Modifier = Modifier,
) {
    val colors = LocalHarnessColors.current
    Box(
        modifier =
            modifier
                .size(40.dp)
                .clip(RoundedCornerShape(20.dp))
                .background(colors.subtle)
                .semantics { contentDescription = label },
        contentAlignment = Alignment.Center,
    ) {
        AppText(text = label.take(1).uppercase(), style = AppTextStyle.Caption)
    }
}

@Composable
fun AppTextField(
    value: String,
    onValueChange: (String) -> Unit,
    label: String,
    modifier: Modifier = Modifier,
) {
    OutlinedTextField(
        value = value,
        onValueChange = onValueChange,
        label = { Text(label) },
        modifier = modifier.fillMaxWidth(),
        singleLine = true,
    )
}

@Composable
fun SettingsSwitch(
    label: String,
    checked: Boolean,
    onCheckedChange: (Boolean) -> Unit,
    modifier: Modifier = Modifier,
    description: String? = null,
) {
    val colors = LocalHarnessColors.current
    Row(
        modifier = modifier.fillMaxWidth().padding(vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(modifier = Modifier.weight(1f)) {
            AppText(text = label, style = AppTextStyle.Body)
            if (description != null) {
                AppText(text = description, style = AppTextStyle.Muted)
            }
        }
        Switch(
            checked = checked,
            onCheckedChange = onCheckedChange,
            colors =
                SwitchDefaults.colors(
                    checkedThumbColor = colors.primaryForeground,
                    checkedTrackColor = colors.primary,
                ),
        )
    }
}

private const val APP_SHEET_MOTION_MS = 280

@Composable
fun AppSheet(
    visible: Boolean,
    onDismiss: () -> Unit,
    title: String = "",
    actionLabel: String? = "完成",
    previewReduceMotion: Boolean = false,
    contentMinHeight: androidx.compose.ui.unit.Dp? = null,
    contentBottomPadding: androidx.compose.ui.unit.Dp = 0.dp,
    content: @Composable ColumnScope.() -> Unit,
) {
    val colors = LocalHarnessColors.current
    val sheetProgress by animateFloatAsState(
        targetValue = if (visible) 1f else 0f,
        animationSpec =
            if (previewReduceMotion) {
                tween(durationMillis = 0)
            } else {
                tween(durationMillis = APP_SHEET_MOTION_MS, easing = FastOutSlowInEasing)
            },
        label = "appSheetPresent",
    )
    if (sheetProgress <= 0.01f && !visible) {
        return
    }
    androidx.compose.ui.window.Dialog(
        onDismissRequest = onDismiss,
        properties =
            androidx.compose.ui.window.DialogProperties(
                usePlatformDefaultWidth = false,
                decorFitsSystemWindows = false,
            ),
    ) {
        Box(modifier = Modifier.fillMaxSize()) {
            Box(
                modifier =
                    Modifier
                        .fillMaxSize()
                        .background(
                            Color.Black.copy(
                                alpha = com.harness.agent.coreui.tokens.HarnessLayout.overlayScrimAlpha * sheetProgress,
                            ),
                        )
                        .clickable(onClick = onDismiss),
            )
            Surface(
                modifier =
                    Modifier
                        .align(Alignment.BottomCenter)
                        .fillMaxWidth()
                        .graphicsLayer {
                            translationY = (1f - sheetProgress) * size.height
                            alpha = sheetProgress
                        }
                        .border(
                            width = 1.dp,
                            color = colors.composerBorder,
                            shape =
                                RoundedCornerShape(
                                    topStart = com.harness.agent.coreui.tokens.HarnessLayout.sheetTopRadius,
                                    topEnd = com.harness.agent.coreui.tokens.HarnessLayout.sheetTopRadius,
                                ),
                        )
                        .clickable(enabled = false, onClick = {}),
                shape = RoundedCornerShape(topStart = com.harness.agent.coreui.tokens.HarnessLayout.sheetTopRadius, topEnd = com.harness.agent.coreui.tokens.HarnessLayout.sheetTopRadius),
                color = colors.surface,
            ) {
                Column(
                    modifier =
                        Modifier
                            .fillMaxWidth()
                            .padding(bottom = androidx.compose.foundation.layout.WindowInsets.navigationBars.asPaddingValues().calculateBottomPadding()),
                ) {
                    Box(
                        modifier =
                            Modifier
                                .fillMaxWidth()
                                .padding(top = 10.dp, bottom = 4.dp),
                        contentAlignment = Alignment.Center,
                    ) {
                        Box(
                            modifier =
                                Modifier
                                    .size(
                                        width = com.harness.agent.coreui.tokens.HarnessLayout.workbenchHandleWidth,
                                        height = com.harness.agent.coreui.tokens.HarnessLayout.workbenchHandleHeight,
                                    )
                                    .background(colors.border, RoundedCornerShape(2.dp)),
                        )
                    }
                    if (title.isNotBlank() || !actionLabel.isNullOrBlank()) {
                        Row(
                            modifier =
                                Modifier
                                    .fillMaxWidth()
                                    .padding(horizontal = 16.dp, vertical = 4.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            if (title.isNotBlank()) {
                                Text(
                                    text = title,
                                    color = colors.primary,
                                    fontWeight = FontWeight.SemiBold,
                                    fontSize = (LocalContentFontSizeSp.current).sp,
                                    modifier = Modifier.weight(1f),
                                )
                            } else {
                                Spacer(modifier = Modifier.weight(1f))
                            }
                            if (!actionLabel.isNullOrBlank()) {
                                Text(
                                    text = actionLabel,
                                    color = colors.link,
                                    fontWeight = FontWeight.SemiBold,
                                    fontSize = 14.sp,
                                    modifier =
                                        Modifier
                                            .clip(RoundedCornerShape(com.harness.agent.coreui.tokens.HarnessLayout.controlRadius))
                                            .clickable(onClick = onDismiss)
                                            .padding(horizontal = 8.dp, vertical = 10.dp),
                                )
                            }
                        }
                    }
                    Column(
                        modifier =
                            Modifier
                                .then(
                                    if (contentMinHeight != null) {
                                        Modifier.heightIn(min = contentMinHeight)
                                    } else {
                                        Modifier
                                    },
                                )
                                .padding(horizontal = 8.dp, vertical = 8.dp)
                                .padding(bottom = contentBottomPadding),
                    ) {
                        content()
                    }
                }
            }
        }
    }
}

@Composable
fun ListRow(
    title: String,
    subtitle: String? = null,
    onClick: (() -> Unit)? = null,
    modifier: Modifier = Modifier,
    showDivider: Boolean = true,
) {
    val colors = LocalHarnessColors.current
    Surface(
        onClick = onClick ?: {},
        enabled = onClick != null,
        color = colors.surface,
        modifier = modifier.fillMaxWidth(),
    ) {
        Column(modifier = Modifier.padding(vertical = 12.dp, horizontal = 4.dp)) {
            AppText(text = title, style = AppTextStyle.Body)
            if (subtitle != null) {
                AppText(text = subtitle, style = AppTextStyle.Muted)
            }
        }
    }
    if (showDivider) {
        AppDivider()
    }
}

@Composable
fun Badge(text: String, modifier: Modifier = Modifier) {
    val colors = LocalHarnessColors.current
    Box(
        modifier =
            modifier
                .clip(RoundedCornerShape(999.dp))
                .background(colors.subtle)
                .padding(horizontal = 8.dp, vertical = 2.dp),
    ) {
        AppText(text = text, style = AppTextStyle.Caption)
    }
}

@Composable
fun Spinner(modifier: Modifier = Modifier) {
    val colors = LocalHarnessColors.current
    CircularProgressIndicator(
        modifier = modifier.size(24.dp),
        color = colors.primary,
        strokeWidth = 2.dp,
    )
}

@Composable
fun AppDivider(modifier: Modifier = Modifier) {
    val colors = LocalHarnessColors.current
    HorizontalDivider(modifier = modifier, color = colors.border, thickness = 1.dp)
}
