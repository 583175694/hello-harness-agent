package com.harness.agent.ui.chat

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.ArrowUpward
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextField
import androidx.compose.material3.TextFieldDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.harness.agent.coreui.primitives.AppButton
import com.harness.agent.coreui.primitives.AppText
import com.harness.agent.coreui.primitives.AppTextStyle
import com.harness.agent.coreui.primitives.Badge
import com.harness.agent.coreui.primitives.HarnessIconButton
import com.harness.agent.coreui.primitives.HarnessIconButtonShape
import com.harness.agent.coreui.tokens.HarnessLayout
import com.harness.agent.coreui.tokens.LocalHarnessColors
import com.harness.agent.model.ClarificationFixture
import com.harness.agent.model.ComposerState
import com.harness.agent.model.ToolApprovalFixture
import com.harness.agent.preview.PreviewUiAction

@Composable
fun ComposerStack(
    state: ComposerState,
    modifier: Modifier = Modifier,
    workbenchOpen: Boolean = false,
    previewReduceMotion: Boolean = false,
    onPreviewAction: (PreviewUiAction) -> Unit = {},
) {
    val colors = LocalHarnessColors.current
    var attachmentOpen by rememberSaveable { mutableStateOf(false) }
    var modelOpen by rememberSaveable { mutableStateOf(false) }
    var skillOpen by rememberSaveable { mutableStateOf(false) }
    var modelId by rememberSaveable(state.selectedModelLabel) {
        mutableStateOf(resolveModelIdFromFixtureLabel(state.selectedModelLabel))
    }
    var reasoningEffort by rememberSaveable(state.selectedModelLabel) {
        mutableStateOf(resolveReasoningFromFixtureLabel(state.selectedModelLabel))
    }
    val modelLabel = formatComposerModelChip(modelId, reasoningEffort)
    val dismissKeyboard = rememberDismissKeyboard()

    LaunchedEffect(attachmentOpen, modelOpen, skillOpen) {
        if (attachmentOpen || modelOpen || skillOpen) {
            dismissKeyboard()
        }
    }

    Column(
        modifier =
            modifier
                .fillMaxWidth()
                .background(colors.canvas)
                .padding(horizontal = 12.dp, vertical = 4.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Box(Modifier.fillMaxWidth()) {
            Column(
                modifier =
                    Modifier
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(HarnessLayout.bubbleRadius))
                        .border(1.dp, colors.composerBorder, RoundedCornerShape(HarnessLayout.bubbleRadius))
                        .background(colors.surface),
            ) {
                if (state.followUps.isNotEmpty()) {
                    FollowUpQueuePanel(
                        items = state.followUps,
                        onSend = { onPreviewAction(PreviewUiAction.SendFollowUp(it)) },
                        onDismiss = { onPreviewAction(PreviewUiAction.DismissFollowUp(it)) },
                    )
                    HorizontalDivider(color = colors.composerBorder, thickness = 1.dp)
                }
                Column(
                    modifier =
                        Modifier
                            .fillMaxWidth()
                            .padding(horizontal = 12.dp, vertical = 10.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                when (state.mode) {
                    "clarification" ->
                        state.clarification?.let {
                            ClarificationPanel(
                                fixture = it,
                                submitting = state.submitting,
                                onCancelRun = { onPreviewAction(PreviewUiAction.CancelRun) },
                                onSubmit = { onPreviewAction(PreviewUiAction.SubmitClarification(it)) },
                            )
                        }
                    "hitl" ->
                        state.toolApproval?.let {
                            ToolApprovalPanel(
                                fixture = it,
                                submitting = state.submitting,
                                onCancelRun = { onPreviewAction(PreviewUiAction.CancelRun) },
                                onReject = { onPreviewAction(PreviewUiAction.RejectTools) },
                                onApprove = { onPreviewAction(PreviewUiAction.ApproveTools) },
                            )
                        }
                    else -> {
                        ComposerSkillChips(skills = state.selectedSkills)
                        ComposerAttachmentStrip(fileNames = state.attachmentNames)
                        ComposerInputRow(
                            state = state,
                            onOpenAttachments = { attachmentOpen = true },
                            onOpenModelMenu = { modelOpen = true },
                            modelLabel = modelLabel,
                            onPreviewAction = onPreviewAction,
                        )
                    }
                }
                }
            }
        }
    }

    ComposerAuxiliarySheets(
        modelOpen = modelOpen,
        onModelOpenChange = { modelOpen = it },
        skillOpen = skillOpen,
        onSkillOpenChange = { skillOpen = it },
        attachmentOpen = attachmentOpen,
        onAttachmentOpenChange = { attachmentOpen = it },
        selectedModelId = modelId,
        reasoningEffort = reasoningEffort,
        onModelIdChange = { id ->
            modelId = id
            reasoningEffort = coerceReasoningForModel(id, reasoningEffort)
        },
        onReasoningChange = { reasoningEffort = it },
        onSkillPicked = { onPreviewAction(PreviewUiAction.AddSkill(it)) },
        onAttachmentPicked = { onPreviewAction(PreviewUiAction.AddAttachment(it)) },
        previewReduceMotion = previewReduceMotion,
    )
}

@Composable
private fun ClarificationPanel(
    fixture: ClarificationFixture,
    submitting: Boolean,
    onCancelRun: () -> Unit,
    onSubmit: (String) -> Unit,
) {
    var answer by rememberSaveable(fixture.question) { mutableStateOf("") }
    Column(
        modifier =
            Modifier
                .fillMaxWidth()
                .border(1.dp, LocalHarnessColors.current.composerBorder, RoundedCornerShape(HarnessLayout.bubbleRadius))
                .padding(14.dp),
    ) {
        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            AppText(text = "需要补充信息", style = AppTextStyle.Title)
            AppText(
                text = "取消运行",
                style = AppTextStyle.Caption,
                modifier = Modifier.clickable(enabled = !submitting, onClick = onCancelRun),
            )
        }
        AppText(text = fixture.question, style = AppTextStyle.Body, modifier = Modifier.padding(vertical = 8.dp))
        if (fixture.options.isNotEmpty()) {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
                fixture.options.forEach { opt ->
                    Badge(
                        text = opt,
                        modifier =
                            Modifier.clickable(enabled = !submitting) {
                                answer = opt
                            },
                    )
                }
            }
        }
        if (fixture.allowFreeText) {
            OutlinedTextField(
                value = answer,
                onValueChange = { answer = it },
                modifier = Modifier.fillMaxWidth().padding(top = 8.dp),
                enabled = !submitting,
                label = { Text("输入回答") },
            )
        }
        AppButton(
            text = "提交回答",
            onClick = { onSubmit(answer) },
            enabled = !submitting && answer.isNotBlank(),
            modifier = Modifier.padding(top = 8.dp),
        )
    }
}

@Composable
private fun ToolApprovalPanel(
    fixture: ToolApprovalFixture,
    submitting: Boolean,
    onCancelRun: () -> Unit,
    onReject: () -> Unit,
    onApprove: () -> Unit,
) {
    val colors = LocalHarnessColors.current
    Column(
        modifier =
            Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(HarnessLayout.bubbleRadius))
                .border(1.dp, colors.composerBorder, RoundedCornerShape(HarnessLayout.bubbleRadius))
                .background(colors.surface)
                .padding(14.dp),
    ) {
        Row(
            modifier =
                Modifier
                    .fillMaxWidth()
                    .padding(bottom = 8.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            AppText(text = fixture.title, style = AppTextStyle.Title, modifier = Modifier.weight(1f))
            AppText(
                text = "取消运行",
                style = AppTextStyle.Caption,
                modifier = Modifier.clickable(enabled = !submitting, onClick = onCancelRun),
            )
        }
        var expandedItemId by rememberSaveable(fixture.items.size) { mutableStateOf<String?>(null) }
        Box(
            modifier =
                Modifier
                    .fillMaxWidth()
                    .height(1.dp)
                    .background(colors.composerBorder),
        )
        fixture.items.forEach { item ->
            val expanded = expandedItemId == item.itemId
            Column(
                modifier =
                    Modifier
                        .fillMaxWidth()
                        .padding(top = 12.dp)
                        .clip(RoundedCornerShape(HarnessLayout.panelRadius))
                        .background(colors.terminalBg)
                        .padding(12.dp),
            ) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    AppText(text = item.toolName, style = AppTextStyle.Muted, modifier = Modifier.weight(1f))
                    AppText(
                        text = if (expanded) "收起" else "展开",
                        style = AppTextStyle.Link,
                        modifier =
                            Modifier.clickable {
                                expandedItemId = if (expanded) null else item.itemId
                            },
                    )
                }
                if (expanded) {
                    AppText(text = item.command, style = AppTextStyle.Body, modifier = Modifier.padding(top = 8.dp))
                }
            }
        }
        fixture.sandboxNote?.let {
            AppText(text = it, style = AppTextStyle.Muted, modifier = Modifier.padding(top = 8.dp))
        }
        Row(
            modifier = Modifier.fillMaxWidth().padding(top = 10.dp),
            horizontalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            HitlActionButton(
                text = "拒绝",
                filled = false,
                onClick = onReject,
                modifier = Modifier.weight(1f),
                enabled = !submitting,
            )
            HitlActionButton(
                text = "批准执行",
                filled = true,
                onClick = onApprove,
                modifier = Modifier.weight(1f),
                enabled = !submitting,
            )
        }
    }
}

@Composable
private fun HitlActionButton(
    text: String,
    filled: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
) {
    val colors = LocalHarnessColors.current
    Box(
        modifier =
            modifier
                .height(40.dp)
                .clip(RoundedCornerShape(HarnessLayout.controlRadius))
                .background(if (filled) colors.primary else colors.rejection)
                .clickable(enabled = enabled, onClick = onClick),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            text = text,
            color = if (filled) colors.primaryForeground else colors.rejectionText,
            fontSize = 13.sp,
            fontWeight = FontWeight.Medium,
        )
    }
}

@Composable
private fun ComposerInputRow(
    state: ComposerState,
    modelLabel: String,
    onOpenAttachments: () -> Unit,
    onOpenModelMenu: () -> Unit,
    onPreviewAction: (PreviewUiAction) -> Unit,
) {
    val colors = LocalHarnessColors.current
    val enabled = state.composerTextMode != "disabled" && state.mode != "hitl"
    val placeholder =
        when (state.composerTextMode) {
            "steer" -> "补充方向，将从下一步骤应用……"
            "clarification" -> "回答确认问题以继续……"
            "disabled" -> "正在取消当前任务……"
            else -> "描述你想完成的任务……"
        }
    var draft by rememberSaveable(state.composerTextMode) { mutableStateOf("") }
    val canSend = enabled && draft.isNotBlank()
    val canPressSend = enabled && (canSend || state.submitting)

    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        TextField(
            value = draft,
            onValueChange = { if (enabled) draft = it },
            modifier =
                Modifier
                    .fillMaxWidth()
                    .heightIn(
                        min = HarnessLayout.composerMinInputHeight,
                        max = HarnessLayout.composerMaxInputHeight,
                    ),
            enabled = enabled,
            placeholder = {
                Text(text = placeholder, color = colors.composerPlaceholder, fontSize = 14.sp)
            },
            textStyle = TextStyle(fontSize = 14.sp, lineHeight = 22.sp, color = colors.primary),
            colors =
                TextFieldDefaults.colors(
                    focusedContainerColor = Color.Transparent,
                    unfocusedContainerColor = Color.Transparent,
                    disabledContainerColor = Color.Transparent,
                    focusedIndicatorColor = Color.Transparent,
                    unfocusedIndicatorColor = Color.Transparent,
                    disabledIndicatorColor = Color.Transparent,
                ),
            minLines = 1,
            maxLines = HarnessLayout.composerInputMaxLines,
        )
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            HarnessIconButton(
                icon = Icons.Filled.Add,
                contentDescription = "添加附件与 Skill",
                onClick = onOpenAttachments,
                touchSize = HarnessLayout.composerPlusSize,
                shape = HarnessIconButtonShape.Control,
            )
            Row(
                modifier = Modifier.weight(1f),
                horizontalArrangement = Arrangement.End,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                ComposerModelMenuChip(
                    modelLabel = modelLabel,
                    onClick = onOpenModelMenu,
                    enabled = enabled,
                    modifier = Modifier.defaultMinSize(minHeight = HarnessLayout.composerPlusSize),
                )
                Box(
                    modifier =
                        Modifier
                            .padding(start = 4.dp)
                            .size(HarnessLayout.composerSendSize)
                            .clip(CircleShape)
                            .background(
                                when {
                                    !enabled -> colors.subtle
                                    state.submitting && draft.isBlank() -> colors.primary
                                    canSend -> colors.primary
                                    state.submitting -> colors.muted
                                    else -> colors.primary
                                },
                            )
                            .clickable(enabled = canPressSend) {
                                when {
                                    state.submitting && draft.isBlank() ->
                                        onPreviewAction(PreviewUiAction.StopRun)
                                    canSend -> {
                                        onPreviewAction(PreviewUiAction.SendComposerText(draft))
                                        draft = ""
                                    }
                                }
                            },
                    contentAlignment = Alignment.Center,
                ) {
                    Icon(
                        imageVector = Icons.Filled.ArrowUpward,
                        contentDescription = if (state.submitting) "停止运行" else "发送任务",
                        modifier = Modifier.size(18.dp),
                        tint = colors.primaryForeground,
                    )
                }
            }
        }
    }
}
