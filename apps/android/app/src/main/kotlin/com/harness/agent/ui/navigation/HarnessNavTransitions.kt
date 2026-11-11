package com.harness.agent.ui.navigation

import androidx.compose.animation.AnimatedContentTransitionScope
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.tween
import androidx.compose.animation.slideInHorizontally
import androidx.compose.animation.slideOutHorizontally
import androidx.navigation.NavBackStackEntry

private const val NAV_SLIDE_MS = 280

/** Push：新页从右侧滑入，当前页略向左移出。 */
fun AnimatedContentTransitionScope<NavBackStackEntry>.harnessNavEnterTransition() =
    slideInHorizontally(
        initialOffsetX = { fullWidth -> fullWidth },
        animationSpec = tween(NAV_SLIDE_MS, easing = FastOutSlowInEasing),
    )

fun AnimatedContentTransitionScope<NavBackStackEntry>.harnessNavExitTransition() =
    slideOutHorizontally(
        targetOffsetX = { fullWidth -> -fullWidth / 4 },
        animationSpec = tween(NAV_SLIDE_MS, easing = FastOutSlowInEasing),
    )

fun AnimatedContentTransitionScope<NavBackStackEntry>.harnessNavPopEnterTransition() =
    slideInHorizontally(
        initialOffsetX = { fullWidth -> -fullWidth / 4 },
        animationSpec = tween(NAV_SLIDE_MS, easing = FastOutSlowInEasing),
    )

fun AnimatedContentTransitionScope<NavBackStackEntry>.harnessNavPopExitTransition() =
    slideOutHorizontally(
        targetOffsetX = { fullWidth -> fullWidth },
        animationSpec = tween(NAV_SLIDE_MS, easing = FastOutSlowInEasing),
    )
