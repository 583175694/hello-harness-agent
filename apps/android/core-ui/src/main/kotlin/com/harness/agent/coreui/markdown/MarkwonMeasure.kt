package com.harness.agent.coreui.markdown

import android.content.Context
import android.graphics.Bitmap
import android.graphics.Canvas
import android.text.Spanned
import android.widget.TextView
import io.noties.markwon.ext.tables.TableRowSpan

/**
 * 让 GFM 表格在第一次 onMeasure 就得到最终行高。
 *
 * Markwon 4.6 的 [TableRowSpan] 只有在 draw() 拿到画布宽度后才按列宽建立 StaticLayout；
 * 在那之前 getSize() 返回 0，整张表格按 0 高参与排版。等它真正显示到屏幕上，TextView 二次增高，
 * LazyColumn 里的 item 随之变高，视觉上就是“滑到表格附近再往上滑一点，内容突然跳一下”。
 *
 * 这里在 onMeasure 内先 layout() 一次，再逐个调用表格行的 draw()：列宽来自 TextView 自己的
 * Layout，因此列布局被正确建立，而 Canvas 只有 1×1，几乎没有光栅化开销。之后重建一次 Layout
 * 重新测量，本次测量返回的就是最终高度，后续滚动与绘制都不会再改变 item 尺寸。
 */
internal class HarnessMarkdownTextView(
    context: Context,
) : TextView(context) {
    private var contentSnapshot: String? = null
    private var preparedWidthPx = -1
    private var preparing = false

    override fun onMeasure(widthMeasureSpec: Int, heightMeasureSpec: Int) {
        super.onMeasure(widthMeasureSpec, heightMeasureSpec)
        if (preparing) return

        val content = text
        if (content !is Spanned || content.isEmpty()) return
        val widthPx = measuredWidth - compoundPaddingLeft - compoundPaddingRight
        if (widthPx <= 0) return
        if (widthPx == preparedWidthPx && content.toString() == contentSnapshot) return

        val tableRows = content.getSpans(0, content.length, TableRowSpan::class.java)
        if (tableRows.isEmpty()) {
            contentSnapshot = content.toString()
            preparedWidthPx = widthPx
            return
        }

        preparing = true
        try {
            prepareTableRows(content, tableRows, widthMeasureSpec, heightMeasureSpec)
        } finally {
            preparing = false
        }
        contentSnapshot = text.toString()
        preparedWidthPx = widthPx
    }

    private fun prepareTableRows(
        content: Spanned,
        tableRows: Array<TableRowSpan>,
        widthMeasureSpec: Int,
        heightMeasureSpec: Int,
    ) {
        // layout() 之后 getWidth() 才可用，TableRowSpan 才能从 SpanUtils 取到正确列宽。
        layout(0, 0, measuredWidth, measuredHeight.coerceAtLeast(1))
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
        var pass = 0
        var heightPx = measuredHeight
        while (pass++ < MAX_PREPARE_PASSES) {
            setText(content)
            super.onMeasure(widthMeasureSpec, heightMeasureSpec)
            if (measuredHeight == heightPx) return
            heightPx = measuredHeight
        }
    }

    private companion object {
        /** 行高通常一轮就稳定；个别异步图片单元格会再触发一轮，留少量余量防止无限重排。 */
        const val MAX_PREPARE_PASSES = 3
    }
}
