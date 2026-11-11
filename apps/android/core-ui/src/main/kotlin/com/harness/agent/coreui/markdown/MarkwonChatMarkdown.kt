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
import com.harness.agent.coreui.tokens.HarnessLayout
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
    timelineReasoningStyle: Boolean = false,
    contentMaxWidth: Dp? = null,
    userBubble: Boolean = false,
) {
    val markwon = rememberHarnessMarkwon()
    val colors = LocalHarnessColors.current
    val baseContentSp = LocalContentFontSizeSp.current.coerceIn(13, 20)
    val baseSp =
        if (timelineReasoningStyle) {
            14f
        } else {
            baseContentSp.toFloat()
        }
    val textColorArgb =
        if (timelineReasoningStyle) {
            colors.muted.toArgb()
        } else {
            colors.primary.toArgb()
        }
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
                setTextColor(textColorArgb)
                setLinkTextColor(colors.link.toArgb())
                val lineMul =
                    when {
                        timelineReasoningStyle -> 22f / 14f
                        userBubble -> HarnessLayout.chatMarkdownUserBubbleLeadingPx / baseSp
                        compact -> 1.45f
                        else -> 1.55f
                    }
                setLineSpacing(0f, lineMul)
                setTextSize(TypedValue.COMPLEX_UNIT_SP, baseSp)
                setPadding(0, topPad, 0, 0)
                appliedCompact = compact
                appliedTextSizeSp = baseSp
                appliedTextColor = textColorArgb
                appliedLinkColor = colors.link.toArgb()
                appliedTopPadding = topPad
                appliedLineSpacingMultiplier = lineMul
                appliedTimelineReasoningStyle = timelineReasoningStyle
            }
        },
        update = { textView ->
            // AndroidView.update 会在 item 重组 / 预取 / 回滚时反复执行。这里必须幂等：
            // 否则每次都把整段 Markdown 重新解析并 setText，长回复（实测 1.8 万 px 高）
            // 会在滚动时触发整段重新排版，表现为“气泡上方一顿”。
            if (textView.appliedCompact != compact) {
                textView.layoutParams =
                    ViewGroup.LayoutParams(
                        if (compact) ViewGroup.LayoutParams.WRAP_CONTENT else ViewGroup.LayoutParams.MATCH_PARENT,
                        ViewGroup.LayoutParams.WRAP_CONTENT,
                    )
                textView.appliedCompact = compact
            }
            val targetMaxWidth = if (compact) maxWidthPx ?: Int.MAX_VALUE else Int.MAX_VALUE
            if (textView.maxWidth != targetMaxWidth) textView.maxWidth = targetMaxWidth
            if (textView.appliedTextSizeSp != baseSp) {
                textView.setTextSize(TypedValue.COMPLEX_UNIT_SP, baseSp)
                textView.appliedTextSizeSp = baseSp
            }
            if (textView.appliedTimelineReasoningStyle != timelineReasoningStyle) {
                textView.appliedTimelineReasoningStyle = timelineReasoningStyle
            }
            if (textView.appliedTextColor != textColorArgb) {
                textView.setTextColor(textColorArgb)
                textView.appliedTextColor = textColorArgb
            }
            val linkColor = colors.link.toArgb()
            if (textView.appliedLinkColor != linkColor) {
                textView.setLinkTextColor(linkColor)
                textView.appliedLinkColor = linkColor
            }
            if (textView.appliedTopPadding != topPad) {
                textView.setPadding(0, topPad, 0, 0)
                textView.appliedTopPadding = topPad
            }
            val lineMultiplier =
                when {
                    timelineReasoningStyle -> 22f / 14f
                    userBubble -> HarnessLayout.chatMarkdownUserBubbleLeadingPx / baseSp
                    compact -> 1.45f
                    else -> 1.55f
                }
            if (textView.appliedLineSpacingMultiplier != lineMultiplier) {
                textView.setLineSpacing(0f, lineMultiplier)
                textView.appliedLineSpacingMultiplier = lineMultiplier
            }
            if (textView.renderedMarkdown != markdown || textView.renderedWith !== markwon) {
                markwon.setMarkdown(textView, markdown)
                textView.renderedMarkdown = markdown
                textView.renderedWith = markwon
                textView.requestLayout()
            }
        },
    )
}
