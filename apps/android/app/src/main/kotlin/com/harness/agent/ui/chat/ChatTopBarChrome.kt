package com.harness.agent.ui.chat

import androidx.annotation.DrawableRes
import androidx.compose.foundation.Image
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Surface
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import com.harness.agent.coreui.motion.harnessPressOpacity
import com.harness.agent.coreui.tokens.HarnessLayout
import com.harness.agent.coreui.tokens.LocalHarnessColors

private val TopBarChromeSize = HarnessLayout.iconToolbarSize
private val TopBarIconSize = 22.dp

@Composable
private fun ChatTopBarPngIcon(
    @DrawableRes iconDrawable: Int,
    modifier: Modifier = Modifier,
) {
    Image(
        painter = painterResource(iconDrawable),
        contentDescription = null,
        modifier = modifier.size(TopBarIconSize),
        contentScale = ContentScale.Fit,
    )
}

@Composable
fun ChatTopBarCircleChrome(
    @DrawableRes iconDrawable: Int,
    contentDescription: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val colors = LocalHarnessColors.current
    val interactionSource = remember { MutableInteractionSource() }
    Surface(
        modifier =
            modifier
                .size(TopBarChromeSize)
                .semantics { this.contentDescription = contentDescription }
                .harnessPressOpacity(interactionSource = interactionSource)
                .clip(CircleShape)
                .clickable(
                    interactionSource = interactionSource,
                    indication = null,
                    onClick = onClick,
                ),
        shape = CircleShape,
        color = colors.surface,
        shadowElevation = HarnessLayout.chatTopBarChromeShadowElevation,
        tonalElevation = 0.dp,
    ) {
        Box(contentAlignment = Alignment.Center) {
            ChatTopBarPngIcon(iconDrawable = iconDrawable)
        }
    }
}

@Composable
fun ChatTopBarActionCapsule(
    modifier: Modifier = Modifier,
    content: @Composable RowScope.() -> Unit,
) {
    val colors = LocalHarnessColors.current
    Surface(
        modifier = modifier,
        shape = RoundedCornerShape(percent = 50),
        color = colors.surface,
        shadowElevation = HarnessLayout.chatTopBarChromeShadowElevation,
        tonalElevation = 0.dp,
    ) {
        Row(
            modifier =
                Modifier
                    .height(TopBarChromeSize)
                    .padding(horizontal = HarnessLayout.chatTopBarActionCapsulePaddingHorizontal),
            horizontalArrangement = Arrangement.spacedBy(HarnessLayout.chatTopBarActionCapsuleIconGap),
            verticalAlignment = Alignment.CenterVertically,
            content = content,
        )
    }
}

@Composable
fun ChatTopBarCapsuleIcon(
    @DrawableRes iconDrawable: Int,
    contentDescription: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val interactionSource = remember { MutableInteractionSource() }
    Box(
        modifier =
            modifier
                .size(TopBarChromeSize)
                .semantics { this.contentDescription = contentDescription }
                .harnessPressOpacity(interactionSource = interactionSource)
                .clip(RoundedCornerShape(percent = 50))
                .clickable(
                    interactionSource = interactionSource,
                    indication = null,
                    onClick = onClick,
                ),
        contentAlignment = Alignment.Center,
    ) {
        ChatTopBarPngIcon(iconDrawable = iconDrawable)
    }
}
