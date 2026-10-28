package com.harness.agent.ui.chat

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.animation.expandVertically
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.shrinkVertically
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
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
import androidx.compose.material.icons.outlined.AccessTime
import androidx.compose.material.icons.outlined.Description
import androidx.compose.material.icons.outlined.KeyboardArrowDown
import androidx.compose.material.icons.outlined.Search
import androidx.compose.material.icons.outlined.Terminal
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.harness.agent.coreui.primitives.AppText
import com.harness.agent.coreui.primitives.AppTextStyle
import com.harness.agent.coreui.primitives.Spinner
import com.harness.agent.coreui.tokens.LocalHarnessColors
import com.harness.agent.model.ProcessBlock
import kotlinx.coroutines.delay

private const val RAIL_WIDTH_DP = 22
private const val RAIL_GAP_DP = 8
private const val FIRST_LINE_HEIGHT_DP = 20
private const val STEP_MIN_HEIGHT_DP = 42
private const val STEP_PADDING_TOP_DP = 4
private const val STEP_PADDING_BOTTOM_DP = 8
private const val SUBTITLE_TOP_GAP_DP = 2
private const val REASONING_BODY_TOP_GAP_DP = 4
private const val PROCESS_EXPAND_MS = 220
private const val PROCESS_FADE_MS = 160

@Composable
fun AssistantProcessTimeline(
    blocks: List<ProcessBlock>,
    modifier: Modifier = Modifier,
    running: Boolean = false,
    finalOutputVisible: Boolean = false,
    onOpenWorkbench: ((toolCallId: String) -> Unit)? = null,
) {
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
    val chevronRotation by animateFloatAsState(
        targetValue = if (open) 180f else 0f,
        animationSpec = tween(durationMillis = 140),
        label = "processTimelineChevron",
    )

    Column(modifier = modifier.fillMaxWidth().padding(vertical = 4.dp)) {
        Row(
            modifier =
                Modifier
                    .fillMaxWidth()
                    .clickable {
                        userExpanded = true
                        open = !open
                    }
                    .padding(vertical = 4.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            AppText(text = headerLabel, style = AppTextStyle.Muted, modifier = Modifier.weight(1f))
            Icon(
                imageVector = Icons.Outlined.KeyboardArrowDown,
                contentDescription = null,
                modifier =
                    Modifier
                        .size(18.dp)
                        .rotate(chevronRotation),
                tint = LocalHarnessColors.current.muted,
            )
        }
        AnimatedVisibility(
            visible = open,
            enter =
                expandVertically(expandFrom = Alignment.Top, animationSpec = tween(PROCESS_EXPAND_MS)) +
                    fadeIn(animationSpec = tween(PROCESS_FADE_MS)),
            exit =
                shrinkVertically(shrinkTowards = Alignment.Top, animationSpec = tween(150)) +
                    fadeOut(animationSpec = tween(140)),
        ) {
            Column(modifier = Modifier.padding(start = 4.dp)) {
                renderable.forEachIndexed { index, pair ->
                    val (_, block) = pair
                    val isLast = index == renderable.lastIndex
                    when (block) {
                        is ProcessBlock.ToolActivity -> ToolActivityStep(block, isLast, onOpenWorkbench)
                        is ProcessBlock.Reasoning -> ReasoningStep(block, isLast)
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
        Column(modifier = Modifier.fillMaxWidth()) {
            ProcessTimelineFirstLine {
                Text(
                    text = title,
                    color = colors.secondary,
                    fontSize = 14.sp,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
            if (block.summary.isNotBlank() && block.summary != title) {
                Text(
                    text = block.summary,
                    color = colors.muted,
                    fontSize = 12.sp,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.padding(top = SUBTITLE_TOP_GAP_DP.dp),
                )
            }
        }
    }
    val canOpen = onOpenWorkbench != null && block.id.isNotBlank()
    ProcessTimelineStep(
        isLast = isLast,
        icon = {
            if (running) {
                Spinner(modifier = Modifier.size(15.dp))
            } else {
                Icon(
                    imageVector = toolIcon(block.name),
                    contentDescription = null,
                    modifier = Modifier.size(15.dp),
                    tint = if (failed) LocalHarnessColors.current.danger else LocalHarnessColors.current.muted,
                )
            }
        },
    ) {
        if (canOpen) {
            Box(
                modifier =
                    Modifier
                        .fillMaxWidth()
                        .clickable { onOpenWorkbench.invoke(block.id) },
            ) {
                stepBody()
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
) {
    var expanded by rememberSaveable(block.content) { mutableStateOf(block.streaming) }
    val label = reasoningTriggerLabel(block.streaming, block.durationMs)
    val chevronRotation by animateFloatAsState(
        targetValue = if (expanded) 180f else 0f,
        animationSpec = tween(durationMillis = 140),
        label = "reasoningChevron",
    )
    ProcessTimelineStep(isLast = isLast, icon = { AppText(text = "◎", style = AppTextStyle.Muted) }) {
        ProcessTimelineFirstLine(
            modifier = Modifier.clickable { expanded = !expanded },
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                AppText(text = label, style = AppTextStyle.Muted, modifier = Modifier.weight(1f))
                Icon(
                    imageVector = Icons.Outlined.KeyboardArrowDown,
                    contentDescription = if (expanded) "收起思考过程" else "展开思考过程",
                    modifier =
                        Modifier
                            .size(18.dp)
                            .rotate(chevronRotation),
                    tint = LocalHarnessColors.current.muted,
                )
            }
        }
        AnimatedVisibility(
            visible = expanded,
            enter =
                expandVertically(expandFrom = Alignment.Top, animationSpec = tween(PROCESS_EXPAND_MS)) +
                    fadeIn(animationSpec = tween(PROCESS_FADE_MS)),
            exit =
                shrinkVertically(shrinkTowards = Alignment.Top, animationSpec = tween(150)) +
                    fadeOut(animationSpec = tween(140)),
        ) {
            AppText(
                text = block.content,
                style = AppTextStyle.Caption,
                modifier =
                    Modifier
                        .fillMaxWidth()
                        .padding(top = REASONING_BODY_TOP_GAP_DP.dp),
            )
        }
    }
}

@Composable
private fun TextProcessStep(
    block: ProcessBlock.Text,
    isLast: Boolean,
) {
    ProcessTimelineStep(isLast = isLast, icon = { Box(modifier = Modifier.size(6.dp)) }) {
        AppText(text = block.content, style = AppTextStyle.Caption, modifier = Modifier.padding(vertical = 4.dp))
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
    content: @Composable () -> Unit,
) {
    val colors = LocalHarnessColors.current
    Row(
        modifier =
            Modifier
                .fillMaxWidth()
                .heightIn(min = STEP_MIN_HEIGHT_DP.dp)
                .padding(top = STEP_PADDING_TOP_DP.dp, bottom = STEP_PADDING_BOTTOM_DP.dp),
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

private fun toolIcon(toolName: String): ImageVector {
    val n = toolName.lowercase()
    return when {
        n.contains("search") || n.contains("fetch") || n.contains("web") -> Icons.Outlined.Search
        n.contains("file") || n.contains("read") -> Icons.Outlined.Description
        n.contains("bash") || n.contains("command") || n.contains("terminal") -> Icons.Outlined.Terminal
        else -> Icons.Outlined.AccessTime
    }
}
