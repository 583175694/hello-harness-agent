package com.harness.agent.coreui.primitives

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.gestures.detectDragGestures
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.semantics.ProgressBarRangeInfo
import androidx.compose.ui.semantics.progressBarRangeInfo
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import com.harness.agent.coreui.tokens.LocalHarnessColors
import kotlin.math.roundToInt

/** 对齐 Web `.ui-slider`：5px 轨道、16px 描边拇指，无 M3 竖线/刻度点。 */
private val WorkbenchStepSliderTrackHeight = 5.dp
private val WorkbenchStepSliderTouchHeight = 22.dp
private val WorkbenchStepSliderThumbRadius = 8.dp
private val WorkbenchStepSliderThumbBorder = 2.dp

@Composable
fun WorkbenchStepSlider(
    stepIndex: Int,
    stepCount: Int,
    onStepIndexChange: (Int) -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
) {
    val colors = LocalHarnessColors.current
    val maxIndex = (stepCount - 1).coerceAtLeast(0)
    val clampedIndex = stepIndex.coerceIn(0, maxIndex)
    val density = LocalDensity.current
    val thumbRadiusPx = with(density) { WorkbenchStepSliderThumbRadius.toPx() }

    var trackWidthPx by remember { mutableFloatStateOf(0f) }

    fun updateFromX(x: Float) {
        if (!enabled || trackWidthPx <= 0f) return
        if (maxIndex == 0) {
            onStepIndexChange(0)
            return
        }
        val innerWidth = trackWidthPx - 2 * thumbRadiusPx
        val fraction = ((x - thumbRadiusPx) / innerWidth).coerceIn(0f, 1f)
        onStepIndexChange((fraction * maxIndex).roundToInt().coerceIn(0, maxIndex))
    }

    Box(
        modifier =
            modifier
                .heightIn(min = 48.dp)
                .fillMaxWidth()
                .semantics {
                    progressBarRangeInfo =
                        ProgressBarRangeInfo(
                            current = clampedIndex.toFloat(),
                            range = 0f..maxIndex.toFloat().coerceAtLeast(1f),
                            steps = maxIndex,
                        )
                }
                .onSizeChanged { trackWidthPx = it.width.toFloat() }
                .pointerInput(enabled, maxIndex) {
                    if (!enabled) return@pointerInput
                    detectTapGestures { offset -> updateFromX(offset.x) }
                }
                .pointerInput(enabled, maxIndex) {
                    if (!enabled) return@pointerInput
                    detectDragGestures { change, _ ->
                        change.consume()
                        updateFromX(change.position.x)
                    }
                },
        contentAlignment = Alignment.Center,
    ) {
        val trackHeightPx = with(density) { WorkbenchStepSliderTrackHeight.toPx() }
        val borderPx = with(density) { WorkbenchStepSliderThumbBorder.toPx() }
        val inactiveColor = colors.composerBorder
        val activeColor = if (enabled) colors.primary else colors.muted
        val thumbFill = colors.surface
        val innerThumbRadius = (thumbRadiusPx - borderPx / 2f).coerceAtLeast(0f)

        Canvas(
            modifier =
                Modifier
                    .fillMaxWidth()
                    .height(WorkbenchStepSliderTouchHeight),
        ) {
            val w = size.width
            val cy = size.height / 2f
            val fraction = if (maxIndex == 0) 0f else clampedIndex.toFloat() / maxIndex
            val thumbX = thumbRadiusPx + (w - 2 * thumbRadiusPx) * fraction
            val trackLeft = thumbRadiusPx
            val trackWidth = w - 2 * thumbRadiusPx

            drawRoundRect(
                color = inactiveColor,
                topLeft = Offset(trackLeft, cy - trackHeightPx / 2f),
                size = Size(trackWidth, trackHeightPx),
                cornerRadius = CornerRadius(trackHeightPx / 2f, trackHeightPx / 2f),
            )
            val activeW = (thumbX - trackLeft).coerceAtLeast(0f)
            if (activeW > 0f) {
                drawRoundRect(
                    color = activeColor,
                    topLeft = Offset(trackLeft, cy - trackHeightPx / 2f),
                    size = Size(activeW, trackHeightPx),
                    cornerRadius = CornerRadius(trackHeightPx / 2f, trackHeightPx / 2f),
                )
            }
            drawCircle(color = thumbFill, radius = innerThumbRadius, center = Offset(thumbX, cy))
            drawCircle(
                color = activeColor,
                radius = innerThumbRadius,
                center = Offset(thumbX, cy),
                style = Stroke(width = borderPx),
            )
        }
    }
}
