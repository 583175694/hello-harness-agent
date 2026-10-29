package com.harness.agent.coreui.primitives

import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.animateDpAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.harness.agent.coreui.motion.rememberHarnessReduceMotion
import com.harness.agent.coreui.tokens.HarnessLayout
import com.harness.agent.coreui.tokens.LocalHarnessColors

private const val SEGMENT_SLIDE_MS = 240
private val SegmentRowHeight = 34.dp

/** 对齐 RN `SlidingSegmentTrack`：滑动高亮 pill，equal-width 分段。 */
@Composable
fun HarnessSegmentedControl(
    segments: List<Pair<String, String>>,
    selectedId: String,
    onSelected: (String) -> Unit,
    modifier: Modifier = Modifier,
    previewReduceMotion: Boolean = false,
) {
    val colors = LocalHarnessColors.current
    val reduceMotion = rememberHarnessReduceMotion(previewReduceMotion)
    val selectedIndex = segments.indexOfFirst { it.first == selectedId }.coerceAtLeast(0)
    val segmentCount = segments.size.coerceAtLeast(1)
    val slideDuration = if (reduceMotion) 0 else SEGMENT_SLIDE_MS

    Box(
        modifier =
            modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(HarnessLayout.controlRadius))
                .background(colors.subtle)
                .padding(HarnessLayout.segmentTrackPadding),
    ) {
        BoxWithConstraints(modifier = Modifier.fillMaxWidth()) {
            val segmentWidth = maxWidth / segmentCount
            val targetOffset = segmentWidth * selectedIndex
            val animatedOffset by animateDpAsState(
                targetOffset,
                animationSpec = tween(durationMillis = slideDuration, easing = FastOutSlowInEasing),
                label = "segmentSlideX",
            )
            val animatedWidth by animateDpAsState(
                segmentWidth,
                animationSpec = tween(durationMillis = slideDuration, easing = FastOutSlowInEasing),
                label = "segmentSlideW",
            )

            Box(
                modifier =
                    Modifier
                        .offset(x = animatedOffset)
                        .width(animatedWidth)
                        .height(SegmentRowHeight)
                        .clip(RoundedCornerShape(HarnessLayout.segmentInnerRadius))
                        .background(colors.primary),
            )
            Row(
                modifier = Modifier.fillMaxWidth().height(SegmentRowHeight),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                segments.forEach { (id, label) ->
                    val selected = id == selectedId
                    Box(
                        modifier =
                            Modifier
                                .weight(1f)
                                .clickable { onSelected(id) }
                                .padding(horizontal = 4.dp),
                        contentAlignment = Alignment.Center,
                    ) {
                        Text(
                            text = label,
                            color = if (selected) colors.primaryForeground else colors.secondary,
                            fontSize = 12.sp,
                            fontWeight = if (selected) FontWeight.SemiBold else FontWeight.Normal,
                            maxLines = 1,
                        )
                    }
                }
            }
        }
    }
}
