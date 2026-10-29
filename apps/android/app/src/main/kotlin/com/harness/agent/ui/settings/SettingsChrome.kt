package com.harness.agent.ui.settings

import androidx.compose.foundation.interaction.MutableInteractionSource
import com.harness.agent.coreui.motion.harnessPressOpacity
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.harness.agent.coreui.tokens.LocalHarnessColors

internal enum class SettingsPillStyle {
    Subtle,
    Primary,
}

@Composable
internal fun SettingsFooterHint(
    text: String,
    modifier: Modifier = Modifier,
) {
    val colors = LocalHarnessColors.current
    Text(
        text = text,
        color = colors.muted,
        fontSize = 11.sp,
        lineHeight = 16.sp,
        textAlign = TextAlign.Center,
        modifier = modifier.fillMaxWidth(),
    )
}

@Composable
internal fun SettingsPillButton(
    text: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier.fillMaxWidth(),
    style: SettingsPillStyle = SettingsPillStyle.Primary,
    enabled: Boolean = true,
) {
    val colors = LocalHarnessColors.current
    val interactionSource = remember { MutableInteractionSource() }
    val background =
        when (style) {
            SettingsPillStyle.Subtle -> colors.subtle
            SettingsPillStyle.Primary -> colors.primary
        }
    val foreground =
        when (style) {
            SettingsPillStyle.Subtle -> colors.secondary
            SettingsPillStyle.Primary -> colors.primaryForeground
        }
    Surface(
        onClick = onClick,
        enabled = enabled,
        interactionSource = interactionSource,
        color = background,
        shape = RoundedCornerShape(999.dp),
        modifier =
            modifier
                .harnessPressOpacity(
                    enabled = enabled,
                    interactionSource = interactionSource,
                    idleAlpha = if (enabled) 1f else 0.45f,
                ),
    ) {
        Box(
            modifier = Modifier.fillMaxWidth().padding(vertical = 14.dp),
            contentAlignment = Alignment.Center,
        ) {
            Text(text = text, fontSize = 16.sp, color = foreground)
        }
    }
}

@Composable
internal fun SettingsBottomDock(
    hint: String? = null,
    content: @Composable ColumnScope.() -> Unit,
) {
    Column(
        modifier =
            Modifier
                .fillMaxWidth()
                .padding(top = 12.dp, bottom = 8.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
        content = content,
    )
    if (!hint.isNullOrBlank()) {
        SettingsFooterHint(text = hint, modifier = Modifier.padding(top = 2.dp))
    }
}
