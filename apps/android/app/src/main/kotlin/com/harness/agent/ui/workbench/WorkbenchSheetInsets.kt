package com.harness.agent.ui.workbench

import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import com.harness.agent.coreui.tokens.HarnessLayout

/**
 * Workbench 使用全屏 [androidx.compose.ui.window.Dialog]；系统 navigationBars inset
 * 在 Dialog 窗口里经常为 0，需读 RootWindowInsets 并对手势条做 dp 兜底。
 */
@Composable
fun rememberWorkbenchBottomSafePadding(): Dp {
    val density = LocalDensity.current
    val view = LocalView.current
    return remember(density, view) {
        val root = ViewCompat.getRootWindowInsets(view)
        val navPx =
            root?.getInsets(WindowInsetsCompat.Type.navigationBars())?.bottom ?: 0
        val tappablePx =
            root?.getInsets(WindowInsetsCompat.Type.tappableElement())?.bottom ?: 0
        val bottomPx = maxOf(navPx, tappablePx)
        with(density) {
            bottomPx.toDp().coerceAtLeast(HarnessLayout.workbenchStepFooterMinSafeInset)
        }
    }
}
