package com.harness.agent.coreui.markdown

import android.content.Context
import android.graphics.Bitmap
import android.graphics.Canvas
import android.text.Spanned
import android.widget.TextView
import io.noties.markwon.Markwon
import io.noties.markwon.ext.tables.TableRowSpan

/**
 * 让 GFM 表格在第一次 onMeasure 就得到最终行高。
 *
 * Markwon 4.6 的 [TableRowSpan] 只有在 draw() 拿到画布宽度后才按列宽建立 StaticLayout；
 * 在那之前 getSize() 返回 0，整张表格按 0 高参与排版。等它真正显示到屏幕上，TextView 二次增高，
 * 表格内多行文本就会压到下一行，视觉上表现为“行与行重叠 / 文字串行”。
 *
 * 这里在 super.onMeasure 之前按 measure spec 的可用宽度预热所有表格行：列宽来自 TextView
 * 自己的宽度，因此列布局被正确建立，而 Canvas 只有 1×1，几乎没有光栅化开销。预热后触发一次
 * TextView 重建，本次测量返回的就是最终高度，后续绘制与滚动都不会再改变 item 尺寸。
 *
 * 关键点是“测量前”预热：如果等 super.onMeasure 用旧的 0 高 span 排完版再补，部分机型会复用
 * 旧 Layout，只在 draw() 时把 span 布局更新，于是表格文字被画到下一行的位置，出现行重叠。
 */
internal class HarnessMarkdownTextView(
    context: Context,
) : TextView(context) {
    /**
     * 上一次成功预热表格时的长度 / 宽度 / 首个 row span 实例。
     * 不用 toString()/equals() 判等：长回复上万个字符，每次测量都做整串比较会白烧 UI 线程。
     */
    private var preparedLength = -1
    private var preparedWidthPx = -1

    /** 表格首个 row span 的实例：重新 setText 后 span 会换成新对象，以此判断是否需要重新预热。 */
    private var preparedFirstRow: TableRowSpan? = null
    private var preparing = false

    /** 上一次真正渲染的 Markdown / Markwon 实例；供 AndroidView.update 判等，避免重复解析。 */
    internal var renderedMarkdown: String? = null
    internal var renderedWith: Markwon? = null

    /* 以下记录已经应用到该 View 的样式，用于让 AndroidView.update 保持幂等。 */
    internal var appliedCompact: Boolean? = null
    internal var appliedTextSizeSp: Float = Float.NaN
    internal var appliedTextColor: Int? = null
    internal var appliedLinkColor: Int? = null
    internal var appliedTopPadding: Int = -1
    internal var appliedLineSpacingMultiplier: Float = Float.NaN
    internal var appliedTimelineReasoningStyle: Boolean = false

    override fun onMeasure(widthMeasureSpec: Int, heightMeasureSpec: Int) {
        prepareTablesIfNeeded(widthMeasureSpec)
        super.onMeasure(widthMeasureSpec, heightMeasureSpec)
    }

    private fun prepareTablesIfNeeded(widthMeasureSpec: Int) {
        if (preparing) return
        val content = text
        if (content !is Spanned || content.isEmpty()) return
        val widthPx = availableTextWidth(widthMeasureSpec)
        if (widthPx <= 0) return
        val tableRows = content.getSpans(0, content.length, TableRowSpan::class.java)
        val firstRow = tableRows.firstOrNull()
        if (widthPx == preparedWidthPx &&
            content.length == preparedLength &&
            firstRow === preparedFirstRow
        ) {
            return
        }
        if (firstRow == null) {
            preparedLength = content.length
            preparedWidthPx = widthPx
            preparedFirstRow = null
            return
        }

        preparing = true
        try {
            prepareTableRows(content, tableRows, widthPx)
        } finally {
            preparing = false
        }
        preparedLength = content.length
        preparedWidthPx = widthPx
        preparedFirstRow = firstRow
    }

    /** 与 TextView 自己排版使用的内容宽度一致；UNSPECIFIED 时退回当前已布局宽度。 */
    private fun availableTextWidth(widthMeasureSpec: Int): Int {
        val padding = compoundPaddingLeft + compoundPaddingRight
        val size = MeasureSpec.getSize(widthMeasureSpec)
        val widthPx =
            if (MeasureSpec.getMode(widthMeasureSpec) == MeasureSpec.UNSPECIFIED) {
                width
            } else {
                size
            }
        return (widthPx - padding).coerceAtLeast(0)
    }

    private fun prepareTableRows(
        content: Spanned,
        tableRows: Array<TableRowSpan>,
        widthPx: Int,
    ) {
        // 先在 widthPx 下布局一次，让 SpanUtils 能拿到与最终排版一致的列宽。
        layout(0, 0, widthPx + compoundPaddingLeft + compoundPaddingRight, 1)
        val probe = Bitmap.createBitmap(1, 1, Bitmap.Config.ALPHA_8)
        try {
            val canvas = Canvas(probe)
            tableRows.forEach { row ->
                row.draw(
                    canvas,
                    content,
                    content.getSpanStart(row),
                    content.getSpanEnd(row),
                    0f,
                    0,
                    0,
                    1,
                    paint,
                )
            }
        } finally {
            probe.recycle()
        }

        // 行 span 已有列布局，重建 Layout 后 getSize() 才会把真实行高算进 measuredHeight。
        // 这里用 setText 触发 TextView 内部重建（固定宽度下会原位 swap Layout），
        // 随后紧接着的 super.onMeasure 拿到的就是带表格行高的 Layout。
        setText(content)
        // 表格行宽可能刚被重算；回到 onMeasure 时 TextView 会重建 Layout，尺寸按真实行高返回。
    }
}
