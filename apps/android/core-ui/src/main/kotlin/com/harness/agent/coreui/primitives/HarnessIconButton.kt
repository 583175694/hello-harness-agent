package com.harness.agent.coreui.primitives

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.harness.agent.coreui.tokens.HarnessLayout
import com.harness.agent.coreui.tokens.LocalHarnessColors

enum class HarnessIconButtonShape {
    Control,
    Circle,
}

/** RN `h-10 w-10 rounded-control active:bg-subtle` / `rounded-full` 顶栏与 ghost icon。 */
@Composable
fun HarnessIconButton(
    icon: ImageVector,
    contentDescription: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    shape: HarnessIconButtonShape = HarnessIconButtonShape.Control,
    iconSizeDp: Int = 20,
    touchSize: Dp = HarnessLayout.iconToolbarSize,
) {
    val colors = LocalHarnessColors.current
    val buttonShape =
        when (shape) {
            HarnessIconButtonShape.Control -> RoundedCornerShape(HarnessLayout.controlRadius)
            HarnessIconButtonShape.Circle -> CircleShape
        }
    Box(
        modifier =
            modifier
                .size(touchSize)
                .alpha(if (enabled) 1f else 0.38f)
                .clip(buttonShape)
                .clickable(enabled = enabled, onClick = onClick)
                .semantics { this.contentDescription = contentDescription },
        contentAlignment = Alignment.Center,
    ) {
        Icon(
            imageVector = icon,
            contentDescription = null,
            modifier = Modifier.size(iconSizeDp.dp),
            tint = if (enabled) colors.primary else colors.muted,
        )
    }
}
