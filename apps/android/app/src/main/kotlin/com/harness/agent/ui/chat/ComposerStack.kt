package com.harness.agent.ui.chat

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.interaction.MutableInteractionSource
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
import androidx.compose.material.icons.rounded.Add
import androidx.compose.material.icons.rounded.ArrowUpward
import androidx.compose.material.icons.rounded.Stop
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextField
import androidx.compose.material3.TextFieldDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import com.harness.agent.coreui.motion.harnessPressOpacity
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
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
import com.harness.agent.model.ComposerModelOption
import com.harness.agent.model.ComposerState
import com.harness.agent.model.PREVIEW_COMPOSER_MODELS
import com.harness.agent.model.ToolApprovalFixture
import com.harness.agent.preview.PreviewComposerBlockKind
import com.harness.agent.preview.PreviewUiAction

@Composable
fun ComposerStack(
    state: ComposerState,
    modifier: Modifier = Modifier,
    workbenchOpen: Boolean = false,
    previewReduceMotion: Boolean = false,
    composerBlock: PreviewComposerBlockKind = PreviewComposerBlockKind.NONE,
    onLoginClick: () -> Unit = {},
    onPreviewAction: (PreviewUiAction) -> Unit = {},
    useCoreAttachments: Boolean = false,
    onPickImageAttachment: () -> Unit = {},
    onPickDocumentAttachment: () -> Unit = {},
    modelCatalog: List<ComposerModelOption> = PREVIEW_COMPOSER_MODELS,
    skillPickerNames: List<String> = emptyList(),
    onSkillSheetOpen: () -> Unit = {},
    onClearComposerRevisionSeed: () -> Unit = {},
    draftPersistenceKey: Any? = null,
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
    val catalog = modelCatalog.ifEmpty { PREVIEW_COMPOSER_MODELS }
    val modelLabel = formatComposerModelChip(modelId, reasoningEffort, catalog)
    val dismissKeyboard = rememberDismissKeyboard()

    LaunchedEffect(catalog) {
        if (catalog.none { it.id == modelId }) {
            modelId = catalog.first().id
            reasoningEffort = coerceReasoningForModel(modelId, reasoningEffort, catalog)
        }
    }

    LaunchedEffect(skillOpen) {
        if (skillOpen) {
            onSkillSheetOpen()
        }
    }

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
                .padding(horizontal = 12.dp)
                .padding(bottom = HarnessLayout.composerChromeBottomExtra),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        ComposerBlockBanner(
            kind = composerBlock,
            onLoginClick = onLoginClick,
        )
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
                        ComposerAttachmentStrip(
                            fileNames = state.attachmentNames,
                            items = state.attachmentItems,
                            onRemoveAttachment = { id -> onPreviewAction(PreviewUiAction.RemoveAttachment(id)) },
                        )
                        ComposerInputRow(
                            state = state,
                            onOpenAttachments = { attachmentOpen = true },
                            onOpenModelMenu = { modelOpen = true },
                            modelLabel = modelLabel,
                            modelId = modelId,
                            reasoningEffort = reasoningEffort,
                            inputBlocked = composerBlock != PreviewComposerBlockKind.NONE,
                            onPreviewAction = onPreviewAction,
                            onClearComposerRevisionSeed = onClearComposerRevisionSeed,
                            onDismissKeyboard = dismissKeyboard,
                            draftPersistenceKey = draftPersistenceKey,
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
            reasoningEffort = coerceReasoningForModel(id, reasoningEffort, catalog)
        },
        modelCatalog = catalog,
        skillPickerNames = skillPickerNames,
        onReasoningChange = { reasoningEffort = it },
        onSkillPicked = { onPreviewAction(PreviewUiAction.AddSkill(it)) },
        onAttachmentPicked = { onPreviewAction(PreviewUiAction.AddAttachment(it)) },
        useCoreAttachments = useCoreAttachments,
        onPickImageAttachment = onPickImageAttachment,
        onPickDocumentAttachment = onPickDocumentAttachment,
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
    val colors = LocalHarnessColors.current
    Column(
        modifier = Modifier.fillMaxWidth(),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            verticalAlignment = Alignment.Top,
        ) {
            Text(
                text = fixture.question,
                color = colors.secondary,
                fontSize = 15.sp,
                lineHeight = 21.sp,
                modifier = Modifier.weight(1f),
            )
            Text(
                text = "取消",
                color = colors.muted,
                fontSize = 13.sp,
                modifier =
                    Modifier
                        .clickable(enabled = !submitting, onClick = onCancelRun)
                        .padding(top = 1.dp),
            )
        }
        if (fixture.options.isNotEmpty()) {
            Row(
                modifier =
                    Modifier
                        .fillMaxWidth()
                        .horizontalScroll(rememberScrollState()),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                fixture.options.forEach { opt ->
                    Badge(
                        text = opt,
                        modifier =
                            Modifier
                                .semantics { role = Role.Button }
                                .clickable(enabled = !submitting) {
                                    onSubmit(opt)
                                },
                    )
                }
            }
        }
        if (fixture.allowFreeText) {
            val trimmed = answer.trim()
            val canSubmit = !submitting && trimmed.isNotEmpty()
            val submitAnswer = {
                if (canSubmit) {
                    onSubmit(trimmed)
                    answer = ""
                }
            }
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                OutlinedTextField(
                    value = answer,
                    onValueChange = { answer = it },
                    modifier = Modifier.weight(1f),
                    enabled = !submitting,
                    placeholder = { Text("其他…", color = colors.muted, fontSize = 14.sp) },
                    maxLines = 1,
                    textStyle = TextStyle(fontSize = 14.sp),
                    keyboardOptions = KeyboardOptions(imeAction = ImeAction.Send),
                    keyboardActions = KeyboardActions(onSend = { submitAnswer() }),
                )
                AppButton(
                    text = "提交",
                    onClick = submitAnswer,
                    enabled = canSubmit,
                    modifier = Modifier.defaultMinSize(minWidth = 64.dp, minHeight = 40.dp),
                )
            }
        }
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
    modelId: String,
    reasoningEffort: String,
    onOpenAttachments: () -> Unit,
    onOpenModelMenu: () -> Unit,
    inputBlocked: Boolean = false,
    onPreviewAction: (PreviewUiAction) -> Unit,
    onClearComposerRevisionSeed: () -> Unit = {},
    onDismissKeyboard: () -> Unit = {},
    draftPersistenceKey: Any? = null,
) {
    val colors = LocalHarnessColors.current
    val running = state.submitting || state.composerTextMode == "steer"
    val enabled = state.composerTextMode != "disabled" && state.mode != "hitl" && !inputBlocked
    val placeholder =
        when (state.composerTextMode) {
            "steer" -> "补充方向，将从下一步骤应用……"
            "clarification" -> "回答确认问题以继续……"
            "disabled" -> "正在取消当前任务……"
            else -> "描述你想完成的任务……"
        }
    // 以会话为键保存草稿：旋转/临时 composerTextMode 变化不会清空输入。
    var draft by rememberSaveable(draftPersistenceKey ?: state.composerTextMode) { mutableStateOf("") }
    LaunchedEffect(state.revisionDraftSeed) {
        val seed = state.revisionDraftSeed?.trim().orEmpty()
        if (seed.isNotEmpty()) {
            draft = seed
            onClearComposerRevisionSeed()
        }
    }
    val canSend = enabled && draft.isNotBlank()
    val canPressSend = enabled && (canSend || running)

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
                icon = Icons.Rounded.Add,
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
                val sendInteractionSource = remember { MutableInteractionSource() }
                Box(
                    modifier =
                        Modifier
                            .padding(start = 4.dp)
                            .size(HarnessLayout.composerSendSize)
                            .harnessPressOpacity(
                                enabled = canPressSend,
                                interactionSource = sendInteractionSource,
                            )
                            .clip(CircleShape)
                            .background(
                                when {
                                    !enabled -> colors.subtle
                                    running && draft.isBlank() -> colors.primary
                                    canSend -> colors.primary
                                    else -> colors.subtle
                                },
                            )
                            .clickable(
                                enabled = canPressSend,
                                interactionSource = sendInteractionSource,
                                indication = null,
                            ) {
                                when {
                                    running && draft.isBlank() ->
                                        onPreviewAction(PreviewUiAction.StopRun)
                                    canSend -> {
                                        onDismissKeyboard()
                                        val submittedText = draft
                                        onPreviewAction(
                                            PreviewUiAction.SendComposerText(
                                                text = submittedText,
                                                modelId = modelId,
                                                reasoningEffort = reasoningEffort,
                                                skillNames = state.selectedSkills,
                                                onResult = { ok -> if (ok && draft == submittedText) draft = "" },
                                            ),
                                        )
                                    }
                                }
                            },
                    contentAlignment = Alignment.Center,
                ) {
                    if (running && draft.isBlank()) {
                        Icon(
                            imageVector = Icons.Rounded.Stop,
                            contentDescription = "停止当前任务",
                            modifier = Modifier.size(16.dp),
                            tint = colors.primaryForeground,
                        )
                    } else {
                        Icon(
                            imageVector = Icons.Rounded.ArrowUpward,
                            contentDescription = if (running) "发送补充" else "发送任务",
                            modifier = Modifier.size(18.dp),
                            tint = colors.primaryForeground,
                        )
                    }
                }
            }
        }
    }
}
