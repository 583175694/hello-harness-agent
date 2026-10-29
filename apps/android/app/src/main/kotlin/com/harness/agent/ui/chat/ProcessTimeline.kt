package com.harness.agent.ui.chat

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.animation.expandVertically
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.shrinkVertically
import androidx.compose.ui.Alignment as UiAlignment
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.ExpandMore
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.rotate
import com.harness.agent.coreui.motion.rememberHarnessReduceMotion
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.harness.agent.coreui.primitives.AppText
import com.harness.agent.coreui.primitives.AppTextStyle
import com.harness.agent.coreui.tokens.LocalHarnessColors
import com.harness.agent.model.ProcessBlock
import kotlinx.coroutines.delay

private const val RAIL_WIDTH_DP = 22
private const val RAIL_GAP_DP = 8
private const val FIRST_LINE_HEIGHT_DP = 20
private const val STEP_MIN_HEIGHT_DP = 42
private const val STEP_PADDING_TOP_DP = 4
private const val STEP_PADDING_BOTTOM_DP = 8
private const val REASONING_BODY_PADDING_START_DP = 12
private const val REASONING_BODY_PADDING_TOP_DP = 6
private const val REASONING_BODY_PADDING_END_DP = 12
private const val REASONING_BODY_PADDING_BOTTOM_DP = 8
private const val REASONING_STEP_EXTRA_BOTTOM_DP = 2
private const val REASONING_CONTENT_ANIM_MS = 220
private const val REASONING_FADE_IN_MS = 160
private const val REASONING_CHEVRON_ANIM_MS = 140
/** 对齐 Web `.ai-reasoning__trigger` gap，Chevron 紧贴文案而非行尾。 */
private const val DISCLOSURE_GAP_DP = 6
private const val RAIL_ICON_SIZE_DP = 15
private const val RAIL_NODE_DOT_SIZE_DP = 6
private const val DISCLOSURE_ICON_SIZE_DP = 16
private const val TIMELINE_TEXT_PRESS_ALPHA = 0.72f
/** 思维链内工具步 / Thinking 正文（对齐 Web `--theme-text-muted` / `.ai-reasoning`）。 */
private val ProcessStepPrimaryFontSize = 14.sp
private val ProcessStepSubtleFontSize = 12.sp
/** 对齐 Web `.ai-reasoning`（`--h-label-tertiary`）+ 略放松行距。 */
private val ProcessReasoningLineHeight = 22.sp

@Composable
fun AssistantProcessTimeline(
    blocks: List<ProcessBlock>,
    modifier: Modifier = Modifier,
    running: Boolean = false,
    finalOutputVisible: Boolean = false,
    onOpenWorkbench: ((toolCallId: String) -> Unit)? = null,
    previewReduceMotion: Boolean = false,
) {
    val reduceMotion = rememberHarnessReduceMotion(previewReduceMotion)
    if (blocks.isEmpty()) return
    val renderable = blocks.filterIsRenderable()
    if (renderable.isEmpty()) return
    var open by rememberSaveable { mutableStateOf(!(finalOutputVisible && !running)) }
    var userExpanded by rememberSaveable { mutableStateOf(false) }
    LaunchedEffect(finalOutputVisible, running, userExpanded) {
        if (!userExpanded && finalOutputVisible && !running) {
            delay(1000)
            open = false
        }
        if (running) open = true
    }

    val headerLabel = formatProcessTimelineHeaderLabel(blocks, running)
    Column(
        modifier =
            modifier
                .fillMaxWidth()
                .padding(vertical = 4.dp),
    ) {
        ProcessTimelineTextClickTarget(
            onClick = {
                userExpanded = true
                open = !open
            },
            modifier =
                Modifier
                    .fillMaxWidth()
                    .padding(vertical = 4.dp),
        ) { textAlpha ->
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(DISCLOSURE_GAP_DP.dp, Alignment.Start),
            ) {
                AppText(
                    text = headerLabel,
                    style = AppTextStyle.Muted,
                    modifier =
                        Modifier
                            .weight(1f, fill = false)
                            .alpha(textAlpha),
                )
                Icon(
                    imageVector = Icons.Rounded.ExpandMore,
                    contentDescription = null,
                    modifier =
                        Modifier
                            .size(DISCLOSURE_ICON_SIZE_DP.dp)
                            .rotate(if (open) 180f else 0f)
                            .alpha(textAlpha),
                    tint = LocalHarnessColors.current.muted,
                )
            }
        }
        AnimatedVisibility(
            visible = open,
            enter = processTimelineBodyEnter(reduceMotion),
            exit = processTimelineBodyExit(reduceMotion),
        ) {
            Column(modifier = Modifier.padding(start = 4.dp, top = 4.dp, bottom = 4.dp)) {
                renderable.forEachIndexed { index, pair ->
                    val (_, block) = pair
                    val isLast = index == renderable.lastIndex
                    when (block) {
                        is ProcessBlock.ToolActivity -> ToolActivityStep(block, isLast, onOpenWorkbench)
                        is ProcessBlock.Reasoning ->
                            ReasoningStep(
                                block = block,
                                isLast = isLast,
                                reduceMotion = reduceMotion,
                            )
                        is ProcessBlock.Text -> TextProcessStep(block, isLast)
                    }
                }
            }
        }
    }
}

private fun List<ProcessBlock>.filterIsRenderable(): List<Pair<Int, ProcessBlock>> {
    val out = mutableListOf<Pair<Int, ProcessBlock>>()
    forEachIndexed { index, block ->
        when (block) {
            is ProcessBlock.Reasoning,
            is ProcessBlock.ToolActivity,
            -> out += index to block
            is ProcessBlock.Text -> if (block.content.isNotBlank()) out += index to block
        }
    }
    return out
}

@Composable
private fun ToolActivityStep(
    block: ProcessBlock.ToolActivity,
    isLast: Boolean,
    onOpenWorkbench: ((toolCallId: String) -> Unit)?,
) {
    val running = block.status == "running"
    val failed = block.status == "failed"
    val title = block.name.ifBlank { "tool" }
    val colors = LocalHarnessColors.current
    val stepBody: @Composable () -> Unit = {
        ProcessTimelineFirstLine {
            ToolActivityInlineLabel(
                toolName = block.name,
                title = title,
                summary = block.summary,
            )
        }
    }
    val canOpen = onOpenWorkbench != null && block.id.isNotBlank()
    ProcessTimelineStep(
        isLast = isLast,
        icon = {
            Icon(
                imageVector = processTimelineToolRailIcon(block.name),
                contentDescription = null,
                modifier = Modifier.size(RAIL_ICON_SIZE_DP.dp),
                tint =
                    when {
                        failed -> colors.danger
                        running -> colors.link
                        else -> colors.muted
                    },
            )
        },
    ) {
        if (canOpen) {
            ProcessTimelineTextClickTarget(
                onClick = { onOpenWorkbench.invoke(block.id) },
                modifier = Modifier.fillMaxWidth(),
            ) { textAlpha ->
                ProcessTimelineFirstLine {
                    Box(Modifier.alpha(textAlpha)) {
                        ToolActivityInlineLabel(
                            toolName = block.name,
                            title = title,
                            summary = block.summary,
                        )
                    }
                }
            }
        } else {
            stepBody()
        }
    }
}

@Composable
private fun ReasoningStep(
    block: ProcessBlock.Reasoning,
    isLast: Boolean,
    reduceMotion: Boolean,
) {
    var expanded by rememberSaveable(block.content) { mutableStateOf(block.streaming) }
    val label = reasoningTriggerLabel(block.streaming, block.durationMs)
    val chevronRotation by animateFloatAsState(
        targetValue = if (expanded) 180f else 0f,
        animationSpec = tween(durationMillis = if (reduceMotion) 0 else REASONING_CHEVRON_ANIM_MS),
        label = "reasoningChevron",
    )
    ProcessTimelineStep(
        isLast = isLast,
        extraBottomPadding = REASONING_STEP_EXTRA_BOTTOM_DP.dp,
        icon = { ProcessTimelineNodeDot() },
    ) {
        Column(modifier = Modifier.fillMaxWidth()) {
            ProcessTimelineTextClickTarget(
                onClick = { expanded = !expanded },
                modifier = Modifier.fillMaxWidth(),
            ) { textAlpha ->
                ProcessTimelineFirstLine {
                    Row(
                        horizontalArrangement = Arrangement.spacedBy(DISCLOSURE_GAP_DP.dp, Alignment.Start),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        ProcessTimelineReasoningText(
                            text = label,
                            modifier =
                                Modifier
                                    .weight(1f, fill = false)
                                    .alpha(textAlpha),
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                        )
                        Icon(
                            imageVector = Icons.Rounded.ExpandMore,
                            contentDescription = if (expanded) "收起思考过程" else "展开思考过程",
                            modifier =
                                Modifier
                                    .size(DISCLOSURE_ICON_SIZE_DP.dp)
                                    .rotate(chevronRotation)
                                    .alpha(textAlpha),
                            tint = LocalHarnessColors.current.muted,
                        )
                    }
                }
            }
            AnimatedVisibility(
                visible = expanded,
                enter = processTimelineBodyEnter(reduceMotion),
                exit = processTimelineBodyExit(reduceMotion),
            ) {
                ProcessTimelineReasoningText(
                    text = block.content,
                    modifier =
                        Modifier
                            .fillMaxWidth()
                            .padding(
                                start = REASONING_BODY_PADDING_START_DP.dp,
                                top = REASONING_BODY_PADDING_TOP_DP.dp,
                                end = REASONING_BODY_PADDING_END_DP.dp,
                                bottom = REASONING_BODY_PADDING_BOTTOM_DP.dp,
                            ),
                )
            }
        }
    }
}

@Composable
private fun TextProcessStep(
    block: ProcessBlock.Text,
    isLast: Boolean,
) {
    ProcessTimelineStep(
        isLast = isLast,
        icon = {
            ProcessTimelineNodeDot()
        },
    ) {
        ProcessTimelinePrimaryText(text = block.content, modifier = Modifier.padding(vertical = 4.dp))
    }
}

/** 对齐 Web Lucide `Dot` / RN 6px 轨道圆点。 */
@Composable
private fun ProcessTimelineNodeDot() {
    Box(
        modifier =
            Modifier
                .size(RAIL_NODE_DOT_SIZE_DP.dp)
                .background(LocalHarnessColors.current.border, CircleShape),
    )
}

@Composable
private fun ProcessTimelinePrimaryText(
    text: String,
    modifier: Modifier = Modifier,
    maxLines: Int = Int.MAX_VALUE,
    overflow: TextOverflow = TextOverflow.Clip,
) {
    Text(
        text = text,
        color = LocalHarnessColors.current.secondary,
        fontSize = ProcessStepPrimaryFontSize,
        lineHeight = 20.sp,
        maxLines = maxLines,
        overflow = overflow,
        modifier = modifier,
    )
}

@Composable
private fun ToolActivityInlineLabel(
    toolName: String,
    title: String,
    summary: String,
) {
    val colors = LocalHarnessColors.current
    val inlineSummary = toolActivityInlineSummary(toolName, title, summary)
    if (inlineSummary == null) {
        Text(
            text = toolActivityPrimaryLine(toolName, title, summary),
            color = colors.muted,
            fontSize = ProcessStepPrimaryFontSize,
            lineHeight = 20.sp,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
    } else {
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                text = title,
                color = colors.muted,
                fontSize = ProcessStepPrimaryFontSize,
                lineHeight = 20.sp,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            Text(
                text = "|",
                color = colors.muted.copy(alpha = 0.45f),
                fontSize = ProcessStepPrimaryFontSize,
                lineHeight = 20.sp,
                modifier = Modifier.padding(horizontal = 6.dp),
            )
            Text(
                text = inlineSummary,
                color = colors.muted,
                fontSize = ProcessStepPrimaryFontSize,
                lineHeight = 20.sp,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.weight(1f, fill = true),
            )
        }
    }
}

@Composable
private fun ProcessTimelineSubtleText(
    text: String,
    modifier: Modifier = Modifier,
    maxLines: Int = Int.MAX_VALUE,
    overflow: TextOverflow = TextOverflow.Clip,
) {
    Text(
        text = text,
        color = LocalHarnessColors.current.muted,
        fontSize = ProcessStepSubtleFontSize,
        lineHeight = 17.sp,
        maxLines = maxLines,
        overflow = overflow,
        modifier = modifier,
    )
}

/** 对齐 Web `.ai-reasoning`（`--h-label-tertiary` / `--theme-text-muted`）。 */
@Composable
private fun ProcessTimelineReasoningText(
    text: String,
    modifier: Modifier = Modifier,
    maxLines: Int = Int.MAX_VALUE,
    overflow: TextOverflow = TextOverflow.Clip,
) {
    Text(
        text = text,
        color = LocalHarnessColors.current.muted,
        fontSize = ProcessStepPrimaryFontSize,
        lineHeight = ProcessReasoningLineHeight,
        maxLines = maxLines,
        overflow = overflow,
        modifier = modifier,
    )
}

/** 无 ripple / 背景，仅通过 [content] 的 alpha 做文字按压反馈。 */
@Composable
private fun ProcessTimelineTextClickTarget(
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    content: @Composable (textAlpha: Float) -> Unit,
) {
    val interactionSource = remember { MutableInteractionSource() }
    val pressed by interactionSource.collectIsPressedAsState()
    val textAlpha = if (pressed) TIMELINE_TEXT_PRESS_ALPHA else 1f
    Box(
        modifier =
            modifier.clickable(
                interactionSource = interactionSource,
                indication = null,
                onClick = onClick,
            ),
    ) {
        content(textAlpha)
    }
}

@Composable
private fun ProcessTimelineFirstLine(
    modifier: Modifier = Modifier,
    content: @Composable () -> Unit,
) {
    Box(
        modifier =
            modifier
                .fillMaxWidth()
                .height(FIRST_LINE_HEIGHT_DP.dp),
        contentAlignment = Alignment.CenterStart,
    ) {
        content()
    }
}

@Composable
private fun ProcessTimelineStep(
    isLast: Boolean,
    icon: @Composable () -> Unit,
    extraBottomPadding: Dp = 0.dp,
    content: @Composable () -> Unit,
) {
    val colors = LocalHarnessColors.current
    Row(
        modifier =
            Modifier
                .fillMaxWidth()
                .heightIn(min = STEP_MIN_HEIGHT_DP.dp)
                .padding(
                    top = STEP_PADDING_TOP_DP.dp,
                    bottom = STEP_PADDING_BOTTOM_DP.dp + extraBottomPadding,
                ),
        verticalAlignment = Alignment.Top,
    ) {
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            modifier =
                Modifier
                    .width(RAIL_WIDTH_DP.dp)
                    .fillMaxHeight(),
        ) {
            Box(
                modifier = Modifier.height(FIRST_LINE_HEIGHT_DP.dp).fillMaxWidth(),
                contentAlignment = Alignment.Center,
            ) {
                icon()
            }
            if (!isLast) {
                Box(
                    modifier =
                        Modifier
                            .width(1.dp)
                            .weight(1f, fill = true)
                            .padding(top = 2.dp)
                            .background(colors.border),
                )
            }
        }
        Box(modifier = Modifier.width(RAIL_GAP_DP.dp))
        Column(
            modifier =
                Modifier
                    .weight(1f)
                    .fillMaxWidth(),
        ) {
            content()
        }
    }
}

/** 展开：高度 + 淡入；收起：仅纵向收缩（内容随高度裁剪，避免先 fadeOut 再缩盒）。 */
private fun processTimelineBodyEnter(reduceMotion: Boolean) =
    if (reduceMotion) {
        fadeIn(animationSpec = tween(durationMillis = 0))
    } else {
        expandVertically(
            animationSpec = tween(durationMillis = REASONING_CONTENT_ANIM_MS),
            expandFrom = UiAlignment.Top,
        ) + fadeIn(animationSpec = tween(durationMillis = REASONING_FADE_IN_MS))
    }

private fun processTimelineBodyExit(reduceMotion: Boolean) =
    if (reduceMotion) {
        fadeOut(animationSpec = tween(durationMillis = 0))
    } else {
        shrinkVertically(
            animationSpec = tween(durationMillis = REASONING_CONTENT_ANIM_MS),
            shrinkTowards = UiAlignment.Top,
        )
    }

