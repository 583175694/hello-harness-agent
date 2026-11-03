package com.harness.mobile.core.api

/**
 * 流式 Markdown 预处理：对齐 Web Streamdown `parseIncompleteMarkdown` 的 v1 子集。
 * 不修改原始 buffer；仅用于 UI 解析前的副本。
 */
object StreamingMarkdown {
    /** UI 节流建议间隔（ms），三端 Gate A 对齐 [mobile-contract/design-tokens.json]。 */
    const val DEFAULT_DEBOUNCE_MS: Long = 120

    fun prepareForParse(source: String): String {
        if (source.isEmpty()) return source
        var text = closeOpenFencedCodeBlocks(source)
        text = stripTrailingUnpairedDoubleAsterisk(text)
        return text
    }

    /** 奇数个 ``` 行时，为 parse 临时补闭合 fence。 */
    internal fun closeOpenFencedCodeBlocks(source: String): String {
        var fenceLines = 0
        for (line in source.lineSequence()) {
            if (line.trimStart().startsWith("```")) fenceLines++
        }
        if (fenceLines % 2 == 0) return source
        return source + "\n```"
    }

    /** 尾部未成对的 `**` 不参与 parse，避免整段变乱。 */
    internal fun stripTrailingUnpairedDoubleAsterisk(source: String): String {
        var pairs = 0
        var i = 0
        while (i < source.length - 1) {
            if (source[i] == '*' && source[i + 1] == '*') {
                pairs++
                i += 2
            } else {
                i++
            }
        }
        if (pairs % 2 == 0) return source
        val last = source.lastIndexOf("**")
        if (last < 0) return source
        return source.substring(0, last)
    }
}
