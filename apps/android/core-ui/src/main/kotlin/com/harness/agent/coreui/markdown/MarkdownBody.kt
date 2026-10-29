package com.harness.agent.coreui.markdown

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.harness.agent.coreui.primitives.AppTextStyle
import com.harness.agent.coreui.tokens.HarnessLayout
import com.harness.agent.coreui.tokens.LocalContentFontSizeSp
import com.harness.agent.coreui.tokens.LocalHarnessColors
import androidx.compose.material3.Text
import org.commonmark.node.BlockQuote
import org.commonmark.node.BulletList
import org.commonmark.node.FencedCodeBlock
import org.commonmark.node.Heading
import org.commonmark.node.ListItem
import org.commonmark.node.Node
import org.commonmark.node.OrderedList
import org.commonmark.node.Paragraph
import org.commonmark.node.Text
import org.commonmark.node.ThematicBreak
import org.commonmark.parser.Parser

private val ListIndent = 14.dp

@Composable
fun MarkdownBody(
    markdown: String,
    modifier: Modifier = Modifier,
    compact: Boolean = false,
) {
    val colors = LocalHarnessColors.current
    val blocks = remember(markdown) { parseMarkdownBlocks(markdown) }
    Column(modifier = modifier) {
        blocks.forEachIndexed { index, block ->
            val blockTop = markdownBlockTopPadding(index, blocks)
            val headingTop =
                when {
                    block !is MarkdownBlock.Heading -> 0.dp
                    index == 0 && compact -> 0.dp
                    index == 0 -> 0.dp
                    block.level == 1 -> 12.dp
                    block.level == 2 -> 10.dp
                    block.level == 3 -> 8.dp
                    else -> 6.dp
                }
            val topPad = blockTop + headingTop
            when (block) {
                is MarkdownBlock.Heading ->
                    MarkdownText(
                        text = block.text,
                        style =
                            when (block.level) {
                                1, 2 -> AppTextStyle.Title
                                else -> AppTextStyle.Body
                            },
                        compact = compact,
                        modifier = Modifier.padding(top = topPad),
                    )
                is MarkdownBlock.Paragraph ->
                    MarkdownText(
                        text = block.text,
                        style = AppTextStyle.Body,
                        compact = compact,
                        modifier = Modifier.padding(top = topPad),
                    )
                is MarkdownBlock.Bullet ->
                    MarkdownText(
                        text = "• ${block.text}",
                        style = AppTextStyle.Body,
                        compact = compact,
                        modifier =
                            Modifier
                                .padding(top = topPad)
                                .padding(start = ListIndent * (block.depth + 1)),
                    )
                is MarkdownBlock.Ordered ->
                    MarkdownText(
                        text = "${block.index}. ${block.text}",
                        style = AppTextStyle.Body,
                        compact = compact,
                        modifier =
                            Modifier
                                .padding(top = topPad)
                                .padding(start = ListIndent * (block.depth + 1)),
                    )
                is MarkdownBlock.Quote ->
                    MarkdownText(
                        text = block.text,
                        style = AppTextStyle.Body,
                        compact = compact,
                        modifier =
                            Modifier
                                .padding(top = topPad)
                                .fillMaxWidth()
                                .background(colors.subtle, RoundedCornerShape(HarnessLayout.controlRadius))
                                .padding(
                                    start = HarnessLayout.chatBubblePaddingHorizontal,
                                    top = HarnessLayout.chatBubblePaddingVertical,
                                    end = HarnessLayout.chatBubblePaddingHorizontal,
                                    bottom = HarnessLayout.chatBubblePaddingVertical,
                                ),
                    )
                is MarkdownBlock.Divider ->
                    Column(
                        modifier =
                            Modifier
                                .fillMaxWidth()
                                .padding(top = topPad)
                                .padding(vertical = 10.dp),
                    ) {
                        androidx.compose.foundation.layout.Box(
                            modifier =
                                Modifier
                                    .fillMaxWidth()
                                    .height(1.dp)
                                    .background(colors.border),
                        )
                    }
                is MarkdownBlock.Code ->
                    MarkdownText(
                        text = block.text,
                        style = AppTextStyle.Caption,
                        compact = compact,
                        monospace = true,
                        modifier =
                            Modifier
                                .padding(top = topPad)
                                .fillMaxWidth()
                                .background(colors.subtle, RoundedCornerShape(HarnessLayout.controlRadius))
                                .padding(HarnessLayout.chatBubblePaddingVertical),
                    )
            }
        }
    }
}

@Composable
private fun MarkdownText(
    text: String,
    style: AppTextStyle,
    compact: Boolean,
    modifier: Modifier = Modifier,
    monospace: Boolean = false,
) {
    val colors = LocalHarnessColors.current
    val base = LocalContentFontSizeSp.current.coerceIn(13, 20)
    val leadingAt14 =
        if (compact) {
            HarnessLayout.chatMarkdownBubbleLeadingAt14
        } else {
            HarnessLayout.chatMarkdownLeadingAt14
        }
    val lineHeight = (base * leadingAt14 / 14f).sp
    val (color, weight, size) =
        when (style) {
            AppTextStyle.Title -> Triple(colors.primary, FontWeight.SemiBold, (base + 2).sp)
            AppTextStyle.Body -> Triple(colors.primary, FontWeight.Normal, base.sp)
            AppTextStyle.Caption -> Triple(colors.secondary, FontWeight.Normal, (base - 2).coerceAtLeast(11).sp)
            AppTextStyle.Muted -> Triple(colors.muted, FontWeight.Normal, (base - 2).coerceAtLeast(11).sp)
            AppTextStyle.Link -> Triple(colors.link, FontWeight.Normal, (base - 2).coerceAtLeast(11).sp)
        }
    val codeLineHeight =
        if (monospace) {
            ((base - 2).coerceAtLeast(11) * 1.55f).sp
        } else {
            lineHeight
        }
    Text(
        text = text,
        modifier = modifier,
        style =
            androidx.compose.ui.text.TextStyle(
                color = color,
                fontWeight = weight,
                fontSize = size,
                lineHeight = if (monospace) codeLineHeight else lineHeight,
                fontFamily =
                    if (monospace) {
                        androidx.compose.ui.text.font.FontFamily.Monospace
                    } else {
                        androidx.compose.ui.text.font.FontFamily.Default
                    },
            ),
    )
}

private fun markdownBlockTopPadding(index: Int, blocks: List<MarkdownBlock>): androidx.compose.ui.unit.Dp {
    if (index == 0) return 0.dp
    val prev = blocks[index - 1]
    val curr = blocks[index]
    if (isListLike(prev) && isListLike(curr)) return HarnessLayout.chatMarkdownListItemGap
    return HarnessLayout.chatMarkdownBlockGap
}

private fun isListLike(block: MarkdownBlock): Boolean =
    block is MarkdownBlock.Bullet || block is MarkdownBlock.Ordered

private sealed class MarkdownBlock {
    data class Heading(val level: Int, val text: String) : MarkdownBlock()

    data class Paragraph(val text: String) : MarkdownBlock()

    data class Bullet(val text: String, val depth: Int = 0) : MarkdownBlock()

    data class Ordered(val index: Int, val text: String, val depth: Int = 0) : MarkdownBlock()

    data class Quote(val text: String) : MarkdownBlock()

    data object Divider : MarkdownBlock()

    data class Code(val text: String) : MarkdownBlock()
}

private fun parseMarkdownBlocks(markdown: String): List<MarkdownBlock> {
    val parser = Parser.builder().build()
    val document = parser.parse(markdown)
    val result = mutableListOf<MarkdownBlock>()
    var node: Node? = document.firstChild
    while (node != null) {
        appendBlockNode(node, result)
        node = node.next
    }
    return result
}

private fun appendBlockNode(node: Node, result: MutableList<MarkdownBlock>) {
    when (node) {
        is Heading -> result += MarkdownBlock.Heading(node.level, node.collectText())
        is Paragraph -> {
            val text = node.collectText()
            if (text.isNotEmpty()) result += MarkdownBlock.Paragraph(text)
        }
        is BlockQuote -> {
            var inner = node.firstChild
            while (inner != null) {
                if (inner is Paragraph) {
                    result += MarkdownBlock.Quote(inner.collectText())
                }
                inner = inner.next
            }
        }
        is ThematicBreak -> result += MarkdownBlock.Divider
        is BulletList -> appendBulletList(node, result, depth = 0)
        is OrderedList -> appendOrderedList(node, result, depth = 0)
        is FencedCodeBlock -> {
            val lang = node.info?.trim().orEmpty()
            val body = node.literal.orEmpty()
            val labeled =
                if (lang.isNotEmpty()) {
                    "$lang\n$body"
                } else {
                    body
                }
            result += MarkdownBlock.Code(labeled.trimEnd())
        }
    }
}

private fun appendBulletList(list: BulletList, result: MutableList<MarkdownBlock>, depth: Int) {
    var item = list.firstChild
    while (item != null) {
        if (item is ListItem) emitListItem(item, result, ordered = false, depth = depth)
        item = item.next
    }
}

private fun appendOrderedList(list: OrderedList, result: MutableList<MarkdownBlock>, depth: Int) {
    var item = list.firstChild
    var index = list.startNumber
    while (item != null) {
        if (item is ListItem) {
            emitListItem(item, result, ordered = true, depth = depth, index = index)
            index++
        }
        item = item.next
    }
}

private fun emitListItem(
    item: ListItem,
    result: MutableList<MarkdownBlock>,
    ordered: Boolean,
    depth: Int,
    index: Int = 1,
) {
    var child = item.firstChild
    var label = ""
    while (child != null) {
        when (child) {
            is Paragraph -> label = child.collectText()
            is BulletList -> appendBulletList(child, result, depth + 1)
            is OrderedList -> appendOrderedList(child, result, depth + 1)
        }
        child = child.next
    }
    if (label.isNotEmpty()) {
        if (ordered) {
            result += MarkdownBlock.Ordered(index, label, depth)
        } else {
            result += MarkdownBlock.Bullet(label, depth)
        }
    }
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
