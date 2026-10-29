package com.harness.agent.ui.chat

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import com.harness.agent.coreui.motion.harnessPressOpacity
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.ArrowDropDown
import androidx.compose.material.icons.rounded.AttachFile
import androidx.compose.material.icons.rounded.Check
import androidx.compose.material.icons.rounded.Image
import androidx.compose.material.icons.rounded.Tag
import androidx.compose.material3.Icon
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.layout.layout
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.zIndex
import com.harness.agent.coreui.primitives.AppSheet
import com.harness.agent.coreui.primitives.AppText
import com.harness.agent.coreui.primitives.AppTextStyle
import com.harness.agent.coreui.primitives.ListRow
import com.harness.agent.coreui.primitives.Spinner
import com.harness.agent.coreui.tokens.HarnessLayout
import com.harness.agent.coreui.tokens.LocalHarnessColors
import com.harness.agent.model.PlanFixture
import com.harness.agent.model.PlanStepFixture

/** Plan 悬浮在锚点上方，不参与 Column 测量高度（对齐 RN `absolute bottom-full`）。 */
fun Modifier.floatAboveAnchor(
    gap: Dp = 10.dp,
    zIndex: Float = 1f,
): Modifier =
    this
        .zIndex(zIndex)
        .layout { measurable, constraints ->
            val placeable = measurable.measure(constraints)
            val gapPx = gap.roundToPx()
            layout(constraints.maxWidth, 0) {
                val x = ((constraints.maxWidth - placeable.width) / 2).coerceAtLeast(0)
                placeable.placeRelative(x, -placeable.height - gapPx)
            }
        }

@Composable
fun PlanFloatingCard(
    plan: PlanFixture,
    modifier: Modifier = Modifier,
    lockCollapsed: Boolean = false,
) {
    val colors = LocalHarnessColors.current
    val steps = plan.steps
    if (steps.isEmpty() || steps.all { it.status == "completed" }) {
        return
    }
    var expanded by rememberSaveable(plan.steps.size, plan.initialExpanded) {
        mutableStateOf(plan.initialExpanded)
    }
    val activeIndex =
        steps.indexOfFirst { it.status == "in_progress" }.takeIf { it >= 0 }
            ?: steps.indexOfLast { it.status == "completed" }.coerceAtLeast(0)
    val stepNumber = (activeIndex + 1).coerceAtMost(steps.size)

    Column(
        modifier =
            modifier
                .fillMaxWidth()
                .padding(horizontal = HarnessLayout.planOverlayHorizontalInset),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        AnimatedVisibility(
            visible = expanded && !lockCollapsed,
            enter = fadeIn(),
            exit = fadeOut(),
        ) {
            Column(
                modifier =
                    Modifier
                        .fillMaxWidth()
                        .widthIn(max = 360.dp)
                        .padding(bottom = 8.dp)
                        .heightIn(max = 280.dp)
                        .shadow(8.dp, RoundedCornerShape(HarnessLayout.panelRadius), clip = false)
                        .clip(RoundedCornerShape(HarnessLayout.panelRadius))
                        .border(1.dp, colors.composerBorder, RoundedCornerShape(HarnessLayout.panelRadius))
                        .background(colors.surface)
                        .verticalScroll(rememberScrollState())
                        .padding(horizontal = 14.dp, vertical = 12.dp),
            ) {
                    plan.explanation?.let {
                        AppText(
                            text = it,
                            style = AppTextStyle.Muted,
                            modifier = Modifier.padding(bottom = 8.dp),
                        )
                    }
                    steps.forEach { step -> PlanStepRow(step) }
                }
            }
        Row(
            modifier =
                Modifier
                    .defaultMinSize(minHeight = 38.dp)
                    .shadow(6.dp, CircleShape, clip = false)
                    .clip(CircleShape)
                    .border(1.dp, colors.composerBorder, CircleShape)
                    .background(colors.surface)
                    .clickable(enabled = !lockCollapsed) { expanded = !expanded }
                    .padding(horizontal = 16.dp, vertical = 8.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Spinner(modifier = Modifier.size(14.dp))
            AppText(
                text = "第 $stepNumber / ${steps.size} 步",
                style = AppTextStyle.Body,
            )
        }
    }
}

@Composable
private fun PlanStepRow(step: PlanStepFixture) {
    val colors = LocalHarnessColors.current
    val textStyle =
        when (step.status) {
            "completed" -> AppTextStyle.Muted
            "in_progress" -> AppTextStyle.Body
            else -> AppTextStyle.Caption
        }
    Row(
        modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp),
        verticalAlignment = Alignment.Top,
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Box(modifier = Modifier.padding(top = 2.dp).size(16.dp), contentAlignment = Alignment.Center) {
            when (step.status) {
                "completed" ->
                    Icon(
                        imageVector = Icons.Rounded.Check,
                        contentDescription = null,
                        modifier = Modifier.size(14.dp),
                        tint = colors.muted,
                    )
                "in_progress" -> Spinner(modifier = Modifier.size(14.dp))
                else ->
                    Box(
                        modifier =
                            Modifier
                                .size(10.dp)
                                .border(1.dp, colors.muted, CircleShape),
                    )
            }
        }
        AppText(text = step.step, style = textStyle, modifier = Modifier.weight(1f))
    }
}

@Composable
fun ComposerModelMenuChip(
    modelLabel: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
) {
    val colors = LocalHarnessColors.current
    val interactionSource = androidx.compose.runtime.remember { MutableInteractionSource() }
    Row(
        modifier =
            modifier
                .defaultMinSize(minHeight = HarnessLayout.composerPlusSize)
                .harnessPressOpacity(enabled = enabled, interactionSource = interactionSource)
                .clip(RoundedCornerShape(HarnessLayout.controlRadius))
                .clickable(
                    enabled = enabled,
                    onClick = onClick,
                    interactionSource = interactionSource,
                    indication = null,
                )
                .padding(horizontal = 8.dp, vertical = 4.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(2.dp),
    ) {
        AppText(
            text = modelLabel,
            style = AppTextStyle.Caption,
            modifier = Modifier.weight(1f, fill = false),
        )
        Icon(
            imageVector = Icons.Rounded.ArrowDropDown,
            contentDescription = null,
            modifier = Modifier.size(14.dp),
            tint = colors.muted,
        )
    }
}

@Composable
fun ComposerAuxiliarySheets(
    modelOpen: Boolean,
    onModelOpenChange: (Boolean) -> Unit,
    skillOpen: Boolean,
    onSkillOpenChange: (Boolean) -> Unit,
    attachmentOpen: Boolean,
    onAttachmentOpenChange: (Boolean) -> Unit,
    selectedModelId: String,
    reasoningEffort: String,
    onModelIdChange: (String) -> Unit,
    onReasoningChange: (String) -> Unit,
    onSkillPicked: (String) -> Unit = {},
    onAttachmentPicked: (String) -> Unit = {},
    previewReduceMotion: Boolean = false,
) {
    AppSheet(
        visible = attachmentOpen,
        onDismiss = { onAttachmentOpenChange(false) },
        title = "",
        actionLabel = null,
        previewReduceMotion = previewReduceMotion,
        contentMinHeight = 220.dp,
        contentBottomPadding = 24.dp,
    ) {
        ComposerSheetActionRow(
            label = "照片与图片",
            icon = Icons.Rounded.Image,
            onClick = {
                onAttachmentPicked("preview-photo.jpg")
                onAttachmentOpenChange(false)
            },
        )
        ComposerSheetActionRow(
            label = "文件",
            icon = Icons.Rounded.AttachFile,
            onClick = {
                onAttachmentPicked("document-preview.pdf")
                onAttachmentOpenChange(false)
            },
        )
        ComposerSheetActionRow(
            label = "Skill",
            icon = Icons.Rounded.Tag,
            onClick = {
                onAttachmentOpenChange(false)
                onSkillOpenChange(true)
            },
        )
    }

    AppSheet(
        visible = modelOpen,
        onDismiss = { onModelOpenChange(false) },
        title = "",
        actionLabel = null,
        previewReduceMotion = previewReduceMotion,
        contentMinHeight = 320.dp,
        contentBottomPadding = 32.dp,
    ) {
        ComposerModelMenuSheetContent(
            selectedModelId = selectedModelId,
            reasoningEffort = reasoningEffort,
            onModelIdChange = onModelIdChange,
            onReasoningChange = onReasoningChange,
        )
    }

    AppSheet(
        visible = skillOpen,
        onDismiss = { onSkillOpenChange(false) },
        title = "",
        actionLabel = null,
        previewReduceMotion = previewReduceMotion,
        contentMinHeight = 240.dp,
        contentBottomPadding = 24.dp,
    ) {
        listOf("research", "code-review", "summarize").forEach { skill ->
            ListRow(
                title = "/$skill",
                showDivider = false,
                onClick = {
                    onSkillPicked(skill)
                    onSkillOpenChange(false)
                },
            )
        }
    }
}

@Composable
private fun ComposerSheetActionRow(
    label: String,
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    onClick: () -> Unit,
) {
    val colors = LocalHarnessColors.current
    Row(
        modifier =
            Modifier
                .fillMaxWidth()
                .defaultMinSize(minHeight = 52.dp)
                .clickable(onClick = onClick)
                .padding(horizontal = 16.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        Icon(imageVector = icon, contentDescription = null, modifier = Modifier.size(20.dp), tint = colors.secondary)
        AppText(text = label, style = AppTextStyle.Body)
    }
}
