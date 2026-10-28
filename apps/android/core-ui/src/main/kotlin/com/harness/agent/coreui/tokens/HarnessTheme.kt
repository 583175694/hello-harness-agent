package com.harness.agent.coreui.tokens

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Color

data class HarnessColorTokens(
    val canvas: Color,
    val drawer: Color,
    val surface: Color,
    val subtle: Color,
    val primary: Color,
    val primaryForeground: Color,
    val secondary: Color,
    val muted: Color,
    val border: Color,
    val link: Color,
    val danger: Color,
    val userBubble: Color,
    val userBubbleBorder: Color,
    val composerBorder: Color,
    val composerPlaceholder: Color,
    val surfaceHover: Color,
    val subtlePressed: Color,
    val approvalText: Color,
    val rejection: Color,
    val rejectionText: Color,
    val terminalBg: Color,
    val terminalFg: Color,
    val terminalMuted: Color,
    val terminalAccent: Color,
)

val LocalHarnessColors = staticCompositionLocalOf {
    HarnessColorTokens(
        canvas = Color(0xFFF7F7F6),
        drawer = Color(0xFFFBFAF9),
        surface = Color.White,
        subtle = Color(0xFFF1F1EF),
        primary = Color(0xFF171717),
        primaryForeground = Color.White,
        secondary = Color(0xFF555551),
        muted = Color(0xFF898986),
        border = Color(0xFFDEDEDB),
        link = Color(0xFF3F5F78),
        danger = Color(0xFF984B41),
        userBubble = Color(0xFFEDF3FE),
        userBubbleBorder = Color(0xFFDBE6F8),
        composerBorder = Color(0xFFEDEDEB),
        composerPlaceholder = Color(0xFFA0A09C),
        surfaceHover = Color(0xFFE9E9E6),
        subtlePressed = Color(0xFFE8E8E5),
        approvalText = Color(0xFF2F5D3A),
        rejection = Color(0xFFF8ECEA),
        rejectionText = Color(0xFF984B41),
        terminalBg = Color(0xFFFFFFFF),
        terminalFg = Color(0xFF171717),
        terminalMuted = Color(0xFF555551),
        terminalAccent = Color(0xFF34C759),
    )
}

object HarnessTokens {
    fun light(): HarnessColorTokens =
        HarnessColorTokens(
            canvas = Color(0xFFF7F7F6),
            drawer = Color(0xFFFBFAF9),
            surface = Color.White,
            subtle = Color(0xFFF1F1EF),
            primary = Color(0xFF171717),
            primaryForeground = Color.White,
            secondary = Color(0xFF555551),
            muted = Color(0xFF898986),
            border = Color(0xFFDEDEDB),
        link = Color(0xFF3F5F78),
        danger = Color(0xFF984B41),
        userBubble = Color(0xFFEDF3FE),
            userBubbleBorder = Color(0xFFDBE6F8),
            composerBorder = Color(0xFFEDEDEB),
            composerPlaceholder = Color(0xFFA0A09C),
            surfaceHover = Color(0xFFE9E9E6),
            subtlePressed = Color(0xFFE8E8E5),
            approvalText = Color(0xFF2F5D3A),
            rejection = Color(0xFFF8ECEA),
            rejectionText = Color(0xFF984B41),
            terminalBg = Color(0xFFFFFFFF),
            terminalFg = Color(0xFF171717),
            terminalMuted = Color(0xFF555551),
            terminalAccent = Color(0xFF34C759),
        )

    fun dark(): HarnessColorTokens =
        HarnessColorTokens(
            canvas = Color(0xFF101010),
            drawer = Color(0xFF141414),
            surface = Color(0xFF181818),
            subtle = Color(0xFF202020),
            primary = Color(0xFFD8D8D8),
            primaryForeground = Color(0xFF101010),
            secondary = Color(0xFFB4B4B0),
            muted = Color(0xFF82827E),
            border = Color(0xFF2B2B2B),
        link = Color(0xFF8FB5CF),
        danger = Color(0xFFE28D85),
        userBubble = Color(0xFF202020),
            userBubbleBorder = Color(0xFF303030),
            composerBorder = Color(0xFF383838),
            composerPlaceholder = Color(0xFF8A8A8A),
            surfaceHover = Color(0xFF252525),
            subtlePressed = Color(0xFF282828),
            approvalText = Color(0xFFA9C5AE),
            rejection = Color(0xFF2D201F),
            rejectionText = Color(0xFFD8AAA3),
            terminalBg = Color(0xFF0F1115),
            terminalFg = Color(0xFFE8EAED),
            terminalMuted = Color(0xFF9499A0),
            terminalAccent = Color(0xFF4ADE80),
        )
}

@Composable
fun HarnessTheme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    contentFontSizeSp: Int = 15,
    content: @Composable () -> Unit,
) {
    val colors = if (darkTheme) HarnessTokens.dark() else HarnessTokens.light()
    val material =
        if (darkTheme) {
            darkColorScheme(
                primary = colors.primary,
                onPrimary = colors.primaryForeground,
                background = colors.canvas,
                surface = colors.surface,
                onSurface = colors.primary,
                outline = colors.border,
            )
        } else {
            lightColorScheme(
                primary = colors.primary,
                onPrimary = colors.primaryForeground,
                background = colors.canvas,
                surface = colors.surface,
                onSurface = colors.primary,
                outline = colors.border,
            )
        }
    CompositionLocalProvider(
        LocalHarnessColors provides colors,
        LocalContentFontSizeSp provides contentFontSizeSp.coerceIn(13, 20),
    ) {
        MaterialTheme(colorScheme = material, content = content)
    }
}
