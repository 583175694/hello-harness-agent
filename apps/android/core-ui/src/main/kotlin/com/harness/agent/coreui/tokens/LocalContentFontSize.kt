package com.harness.agent.coreui.tokens

import androidx.compose.runtime.staticCompositionLocalOf

/** Settings「正文字号」；Body 以此为 sp 基准。 */
val LocalContentFontSizeSp = staticCompositionLocalOf { 15 }

/** 当前 Compose 主题是否为深色，供 Activity / Dialog 同步系统栏图标。 */
val LocalHarnessDarkTheme = staticCompositionLocalOf { false }
