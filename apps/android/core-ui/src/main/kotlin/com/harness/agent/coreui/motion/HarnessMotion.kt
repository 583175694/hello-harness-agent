package com.harness.agent.coreui.motion

import android.provider.Settings
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.composed
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.platform.LocalContext

@Composable
fun rememberHarnessReduceMotion(previewReduceMotion: Boolean = false): Boolean {
    val context = LocalContext.current
    val systemReduceMotion =
        remember {
            try {
                Settings.Global.getFloat(context.contentResolver, Settings.Global.TRANSITION_ANIMATION_SCALE) == 0f
            } catch (_: Exception) {
                false
            }
        }
    return previewReduceMotion || systemReduceMotion
}

/** 简洁按压：仅透明度瞬时变暗，无缩放；需与同一 [interactionSource] 的 clickable 联用。 */
fun Modifier.harnessPressOpacity(
    enabled: Boolean = true,
    interactionSource: MutableInteractionSource,
    idleAlpha: Float = 1f,
    pressedAlpha: Float = 0.72f,
): Modifier =
    composed {
        val pressed by interactionSource.collectIsPressedAsState()
        val factor by animateFloatAsState(
            targetValue = if (pressed && enabled) pressedAlpha else 1f,
            animationSpec = tween(durationMillis = 80),
            label = "harnessPressOpacity",
        )
        alpha(idleAlpha * factor)
    }
