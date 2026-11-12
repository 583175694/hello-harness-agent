package com.harness.agent.coreui.tokens

import android.app.Activity
import android.content.Context
import android.content.ContextWrapper
import android.view.Window
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.window.DialogWindowProvider
import androidx.core.view.WindowCompat

/**
 * Keeps status/navigation bar icon polarity aligned with the Compose theme.
 * Edge-to-edge leaves the bars transparent, so only the icon appearance changes.
 */
@Composable
fun HarnessSystemBarAppearance(darkTheme: Boolean = LocalHarnessDarkTheme.current) {
    val view = LocalView.current
    DisposableEffect(view, darkTheme) {
        val currentView = view
        val window = currentView.findWindow() ?: currentView.context.findActivity()?.window
        val controller = window?.let { WindowCompat.getInsetsController(it, currentView) }
        val previousStatus = controller?.isAppearanceLightStatusBars
        val previousNavigation = controller?.isAppearanceLightNavigationBars
        controller?.isAppearanceLightStatusBars = !darkTheme
        controller?.isAppearanceLightNavigationBars = !darkTheme
        onDispose {
            if (controller != null) {
                previousStatus?.let { controller.isAppearanceLightStatusBars = it }
                previousNavigation?.let { controller.isAppearanceLightNavigationBars = it }
            }
        }
    }
}

private fun android.view.View.findWindow(): Window? {
    var parentView = parent
    while (parentView != null) {
        if (parentView is DialogWindowProvider) return parentView.window
        parentView = parentView.parent
    }
    return null
}

private tailrec fun Context.findActivity(): Activity? =
    when (this) {
        is Activity -> this
        is ContextWrapper -> baseContext.findActivity()
        else -> null
    }
