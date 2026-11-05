package com.harness.agent.coreui.markdown

import android.text.method.LinkMovementMethod
import android.util.TypedValue
import android.view.ViewGroup
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.wrapContentWidth
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import com.harness.agent.coreui.tokens.LocalContentFontSizeSp
import com.harness.agent.coreui.tokens.LocalHarnessColors
import io.noties.markwon.AbstractMarkwonPlugin
import io.noties.markwon.Markwon
import io.noties.markwon.core.MarkwonTheme
import io.noties.markwon.ext.strikethrough.StrikethroughPlugin
import io.noties.markwon.ext.tables.TablePlugin
import io.noties.markwon.linkify.LinkifyPlugin

@Composable
fun rememberHarnessMarkwon(): Markwon {
    val context = LocalContext.current
    val colors = LocalHarnessColors.current
    return remember(context, colors) {
        val density = context.resources.displayMetrics.density
        fun dp(value: Float): Int = (value * density + 0.5f).toInt()
        val tablePlugin =
            TablePlugin.create { builder ->
                builder
                    .tableBorderColor(colors.border.toArgb())
                    .tableBorderWidth(1)
                    .tableCellPadding(8)
                    .tableHeaderRowBackgroundColor(colors.subtle.toArgb())
                    .tableOddRowBackgroundColor(colors.surface.toArgb())
                    .tableEvenRowBackgroundColor(colors.subtle.copy(alpha = 0.35f).toArgb())
            }
        Markwon.builder(context)
            .usePlugin(StrikethroughPlugin.create())
            .usePlugin(LinkifyPlugin.create())
            .usePlugin(tablePlugin)
            .usePlugin(
                object : AbstractMarkwonPlugin() {
                    override fun configureTheme(builder: MarkwonTheme.Builder) {
                        builder
                            .linkColor(colors.link.toArgb())
                            .codeTextColor(colors.primary.toArgb())
                            .codeBackgroundColor(colors.subtle.toArgb())
                            .headingBreakHeight(0)
                            .thematicBreakColor(colors.border.toArgb())
                            .thematicBreakHeight(1)
                            .bulletWidth(dp(3.5f))
                            .bulletListItemStrokeWidth(dp(0.75f))
                    }
                },
            )
            .build()
    }
}

/** Production 对话 Markdown：Markwon + TextView（GFM 表格 / 删除线 / 链接）。 */
@Composable
fun MarkwonChatMarkdown(
    markdown: String,
    modifier: Modifier = Modifier,
    compact: Boolean = false,
    followsProcessTimeline: Boolean = false,
    contentMaxWidth: Dp? = null,
) {
    val markwon = rememberHarnessMarkwon()
    val colors = LocalHarnessColors.current
    val baseSp = LocalContentFontSizeSp.current.coerceIn(13, 20)
    val density = LocalDensity.current
    val topPad =
        if (followsProcessTimeline) {
            with(density) { 4.dp.roundToPx() }
        } else {
            0
        }
    val maxWidthPx =
        contentMaxWidth?.let { with(density) { it.roundToPx() } }
            ?: if (compact) with(density) { 280.dp.roundToPx() } else null
    val widthModifier =
        if (compact) {
            Modifier.wrapContentWidth(Alignment.Start)
        } else {
            Modifier.fillMaxWidth()
        }

    AndroidView(
        modifier = modifier.then(widthModifier),
        factory = { ctx ->
            HarnessMarkdownTextView(ctx).apply {
                layoutParams =
                    ViewGroup.LayoutParams(
                        if (compact) ViewGroup.LayoutParams.WRAP_CONTENT else ViewGroup.LayoutParams.MATCH_PARENT,
                        ViewGroup.LayoutParams.WRAP_CONTENT,
                    )
                movementMethod = LinkMovementMethod.getInstance()
                setTextIsSelectable(true)
                setTextColor(colors.primary.toArgb())
                setLinkTextColor(colors.link.toArgb())
                setLineSpacing(0f, if (compact) 1.45f else 1.55f)
                setTextSize(TypedValue.COMPLEX_UNIT_SP, baseSp.toFloat())
                setPadding(0, topPad, 0, 0)
            }
        },
        update = { textView ->
            textView.layoutParams =
                ViewGroup.LayoutParams(
                    if (compact) ViewGroup.LayoutParams.WRAP_CONTENT else ViewGroup.LayoutParams.MATCH_PARENT,
                    ViewGroup.LayoutParams.WRAP_CONTENT,
                )
            if (compact && maxWidthPx != null) {
                textView.maxWidth = maxWidthPx
            } else {
                textView.maxWidth = Int.MAX_VALUE
            }
            textView.setTextSize(TypedValue.COMPLEX_UNIT_SP, baseSp.toFloat())
            textView.setTextColor(colors.primary.toArgb())
            textView.setLinkTextColor(colors.link.toArgb())
            textView.setPadding(0, topPad, 0, 0)
            textView.setLineSpacing(0f, if (compact) 1.45f else 1.55f)
            markwon.setMarkdown(textView, markdown)
            textView.requestLayout()
        },
    )
}
