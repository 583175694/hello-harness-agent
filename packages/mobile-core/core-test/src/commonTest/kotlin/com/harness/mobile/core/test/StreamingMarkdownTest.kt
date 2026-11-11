package com.harness.mobile.core.test

import com.harness.mobile.core.api.StreamingMarkdown
import kotlin.test.Test
import kotlin.test.assertEquals

class StreamingMarkdownTest {
    @Test
    fun emptyUnchanged() {
        assertEquals("", StreamingMarkdown.prepareForParse(""))
    }

    @Test
    fun completeMarkdownUnchanged() {
        val md =
            """
            # Title

            - one
            - two

            ```js
            const x = 1
            ```
            """.trimIndent()
        assertEquals(md, StreamingMarkdown.prepareForParse(md))
    }

    @Test
    fun closesSingleOpenFence() {
        val input = "# Hi\n\n```kotlin\nfun main() {"
        assertEquals("$input\n```", StreamingMarkdown.prepareForParse(input))
    }

    @Test
    fun evenFenceLinesUnchanged() {
        val input = "```\na\n```"
        assertEquals(input, StreamingMarkdown.prepareForParse(input))
    }

    @Test
    fun stripsTrailingUnpairedBold() {
        val input = "Hello **world"
        assertEquals("Hello ", StreamingMarkdown.prepareForParse(input))
    }

    @Test
    fun pairedBoldUnchanged() {
        val input = "Hello **world**"
        assertEquals(input, StreamingMarkdown.prepareForParse(input))
    }
}
