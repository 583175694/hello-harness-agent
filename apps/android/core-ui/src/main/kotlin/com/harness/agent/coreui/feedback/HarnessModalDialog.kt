package com.harness.agent.coreui.feedback

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.scaleIn
import androidx.compose.animation.scaleOut
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.harness.agent.coreui.tokens.HarnessLayout
import com.harness.agent.coreui.tokens.LocalHarnessColors

@Composable
fun HarnessModalDialog(
    onDismiss: () -> Unit,
    modifier: Modifier = Modifier,
    content: @Composable ColumnScope.() -> Unit,
) {
    val scrimInteraction = remember { MutableInteractionSource() }
    Box(modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
        AnimatedVisibility(
            visible = true,
            enter = fadeIn(tween(220)),
            exit = fadeOut(tween(160)),
        ) {
            Box(
                modifier =
                    Modifier
                        .fillMaxSize()
                        .background(Color.Black.copy(alpha = 0.25f))
                        .clickable(
                            interactionSource = scrimInteraction,
                            indication = null,
                            onClick = onDismiss,
                        ),
            )
        }
        AnimatedVisibility(
            visible = true,
            enter = fadeIn(tween(240)) + scaleIn(initialScale = 0.94f, animationSpec = tween(260)),
            exit = fadeOut(tween(160)) + scaleOut(targetScale = 0.96f, animationSpec = tween(160)),
        ) {
            Surface(
                modifier =
                    Modifier
                        .padding(horizontal = 16.dp)
                        .fillMaxWidth(),
                shape = RoundedCornerShape(HarnessLayout.settingsCardRadius),
                color = LocalHarnessColors.current.surface,
            ) {
                Column(Modifier.padding(16.dp), content = content)
            }
        }
    }
}

@Composable
fun HarnessModalActionRow(
    dismissLabel: String,
    onDismiss: () -> Unit,
    confirmLabel: String,
    onConfirm: () -> Unit,
    confirmEnabled: Boolean = true,
    destructive: Boolean = false,
    modifier: Modifier = Modifier,
) {
    val colors = LocalHarnessColors.current
    Row(
        modifier = modifier.fillMaxWidth().padding(top = 16.dp),
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        HarnessModalPillButton(
            text = dismissLabel,
            onClick = onDismiss,
            background = colors.subtle,
            foreground = colors.secondary,
            modifier = Modifier.weight(1f),
        )
        HarnessModalPillButton(
            text = confirmLabel,
            onClick = onConfirm,
            enabled = confirmEnabled,
            background = if (destructive) colors.danger else colors.primary,
            foreground = if (destructive) Color.White else colors.primaryForeground,
            modifier = Modifier.weight(1f),
        )
    }
}

@Composable
fun HarnessModalPrimaryButton(
    label: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    destructive: Boolean = false,
    enabled: Boolean = true,
) {
    val colors = LocalHarnessColors.current
    HarnessModalPillButton(
        text = label,
        onClick = onClick,
        enabled = enabled,
        background = if (destructive) colors.danger else colors.primary,
        foreground = if (destructive) Color.White else colors.primaryForeground,
        modifier = modifier.fillMaxWidth().padding(top = 16.dp),
    )
}

@Composable
private fun HarnessModalPillButton(
    text: String,
    onClick: () -> Unit,
    background: Color,
    foreground: Color,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
) {
    Surface(
        onClick = onClick,
        enabled = enabled,
        color = background,
        shape = RoundedCornerShape(HarnessLayout.controlRadius),
        modifier = modifier,
    ) {
        Box(
            modifier = Modifier.fillMaxWidth().padding(vertical = 12.dp),
            contentAlignment = Alignment.Center,
        ) {
            Text(
                text = text,
                fontSize = 15.sp,
                fontWeight = FontWeight.SemiBold,
                color = foreground.copy(alpha = if (enabled) 1f else 0.45f),
            )
        }
    }
}
