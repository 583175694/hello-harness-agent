package com.harness.agent.coreui.primitives

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.harness.agent.coreui.tokens.HarnessLayout
import com.harness.agent.coreui.tokens.LocalHarnessColors

/** 对齐 RN `AGENT_UI_BUTTON` segmentTrack / segmentTabSelected（瞬时背景，无 scale）。 */
@Composable
fun HarnessSegmentedControl(
    segments: List<Pair<String, String>>,
    selectedId: String,
    onSelected: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    val colors = LocalHarnessColors.current
    Row(
        modifier =
            modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(HarnessLayout.controlRadius))
                .background(colors.subtle)
                .padding(HarnessLayout.segmentTrackPadding),
    ) {
        segments.forEach { (id, label) ->
            val selected = id == selectedId
            Box(
                modifier =
                    Modifier
                        .weight(1f)
                        .clip(RoundedCornerShape(HarnessLayout.segmentInnerRadius))
                        .background(if (selected) colors.primary else Color.Transparent)
                        .clickable { onSelected(id) }
                        .padding(vertical = 6.dp, horizontal = 4.dp),
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
