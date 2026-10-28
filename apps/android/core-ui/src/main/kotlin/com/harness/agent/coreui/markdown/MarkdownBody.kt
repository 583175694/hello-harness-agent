package com.harness.agent.coreui.markdown

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.harness.agent.coreui.primitives.AppText
import com.harness.agent.coreui.primitives.AppTextStyle
import com.harness.agent.coreui.tokens.LocalHarnessColors
import org.commonmark.node.BulletList
import org.commonmark.node.FencedCodeBlock
import org.commonmark.node.Heading
import org.commonmark.node.Node
import org.commonmark.node.Paragraph
import org.commonmark.node.Text
import org.commonmark.parser.Parser

@Composable
fun MarkdownBody(
    markdown: String,
    modifier: Modifier = Modifier,
) {
    val colors = LocalHarnessColors.current
    val blocks = remember(markdown) { parseMarkdownBlocks(markdown) }
    Column(modifier = modifier.fillMaxWidth()) {
        blocks.forEach { block ->
            when (block) {
                is MarkdownBlock.Heading ->
                    AppText(
                        text = block.text,
                        style = if (block.level <= 2) AppTextStyle.Title else AppTextStyle.Body,
                        modifier = Modifier.padding(top = 10.dp, bottom = 4.dp),
                    )
                is MarkdownBlock.Paragraph ->
                    AppText(
                        text = block.text,
                        style = AppTextStyle.Body,
                        modifier = Modifier.padding(vertical = 4.dp),
                    )
                is MarkdownBlock.Bullet ->
                    AppText(
                        text = "• ${block.text}",
                        style = AppTextStyle.Body,
                        modifier = Modifier.padding(start = 8.dp, top = 2.dp, bottom = 2.dp),
                    )
                is MarkdownBlock.Code ->
                    AppText(
                        text = block.text,
                        style = AppTextStyle.Caption,
                        modifier =
                            Modifier
                                .fillMaxWidth()
                                .padding(vertical = 6.dp)
                                .background(colors.subtle, RoundedCornerShape(8.dp))
                                .padding(10.dp),
                    )
            }
        }
    }
}

private sealed class MarkdownBlock {
    data class Heading(val level: Int, val text: String) : MarkdownBlock()

    data class Paragraph(val text: String) : MarkdownBlock()

    data class Bullet(val text: String) : MarkdownBlock()

    data class Code(val text: String) : MarkdownBlock()
}

private fun parseMarkdownBlocks(markdown: String): List<MarkdownBlock> {
    val parser = Parser.builder().build()
    val document = parser.parse(markdown)
    val result = mutableListOf<MarkdownBlock>()
    var node: Node? = document.firstChild
    while (node != null) {
        when (node) {
            is Heading -> result += MarkdownBlock.Heading(node.level, node.collectText())
            is Paragraph -> result += MarkdownBlock.Paragraph(node.collectText())
            is BulletList -> {
                var item = node.firstChild
                while (item != null) {
                    result += MarkdownBlock.Bullet(item.collectText())
                    item = item.next
                }
            }
            is FencedCodeBlock -> result += MarkdownBlock.Code(node.literal.orEmpty())
        }
        node = node.next
    }
    return result
}

private fun Node.collectText(): String {
    val builder = StringBuilder()
    var child: Node? = firstChild
    while (child != null) {
        if (child is Text) builder.append(child.literal)
        else builder.append(child.collectText())
        child = child.next
    }
    return builder.toString().trim()
}
