import SwiftUI

struct ComposerStackView: View {
    let state: ComposerState
    var workbenchOpen: Bool = false
    var composerBlock: PreviewComposerBlockKind = .none
    var onLoginClick: () -> Void = {}
    var onPreviewAction: (PreviewUiAction) -> Void = { _ in }
    @State private var draft: String = ""
    @State private var clarificationAnswer: String = ""
    @State private var modelOpen = false
    @State private var attachOpen = false
    @State private var skillOpen = false
    @State private var selectedModelId: String
    @State private var reasoningEffort: String

    private var modelChipLabel: String {
        ComposerModelMenuLabels.chipLabel(modelId: selectedModelId, effort: reasoningEffort)
    }

    private var overlayOpen: Bool {
        attachOpen || modelOpen || skillOpen
    }

    init(
        state: ComposerState,
        workbenchOpen: Bool = false,
        composerBlock: PreviewComposerBlockKind = .none,
        onLoginClick: @escaping () -> Void = {},
        onPreviewAction: @escaping (PreviewUiAction) -> Void = { _ in }
    ) {
        self.state = state
        self.workbenchOpen = workbenchOpen
        self.composerBlock = composerBlock
        self.onLoginClick = onLoginClick
        self.onPreviewAction = onPreviewAction
        _selectedModelId = State(initialValue: ComposerModelMenuLabels.resolveModelId(from: state.selectedModelLabel))
        _reasoningEffort = State(initialValue: ComposerModelMenuLabels.resolveReasoning(from: state.selectedModelLabel))
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            ComposerBlockBannerView(kind: composerBlock, onLoginClick: onLoginClick)
            composerBubbleShell
        }
        .padding(.horizontal, 12)
        .sheet(isPresented: $attachOpen) {
            attachmentSheet
        }
        .sheet(isPresented: $modelOpen) {
            modelSheet
        }
        .sheet(isPresented: $skillOpen) {
            skillSheet
        }
        .onChange(of: overlayOpen) { _, open in
            if open { PreviewKeyboardDismiss.run() }
        }
    }

    private var composerSheetHandle: some View {
        RoundedRectangle(cornerRadius: 2, style: .continuous)
            .fill(HarnessColors.border)
            .frame(width: 36, height: 4)
            .padding(.top, 10)
            .padding(.bottom, 8)
    }

    private var attachmentSheet: some View {
        VStack(spacing: 0) {
            composerSheetHandle
            composerSheetAction("照片与图片") {
                onPreviewAction(.addAttachment("preview-photo.jpg"))
                attachOpen = false
            }
            composerSheetAction("文件") {
                onPreviewAction(.addAttachment("document-preview.pdf"))
                attachOpen = false
            }
            composerSheetAction("Skill") {
                attachOpen = false
                skillOpen = true
            }
            Spacer(minLength: 28)
        }
        .padding(.bottom, 24)
        .presentationDetents([.fraction(0.34)])
        .presentationDragIndicator(.visible)
    }

    private var modelSheet: some View {
        VStack(spacing: 0) {
            composerSheetHandle
            ComposerModelMenuSheetView(
                selectedModelId: $selectedModelId,
                reasoningEffort: $reasoningEffort
            )
        }
        .presentationDetents([.fraction(0.44)])
        .presentationDragIndicator(.visible)
    }

    private var skillSheet: some View {
        VStack(spacing: 0) {
            composerSheetHandle
            ForEach(["/research", "/code-review", "/summarize"], id: \.self) { skill in
                composerSheetAction(skill) {
                    onPreviewAction(.addSkill(String(skill.dropFirst())))
                    skillOpen = false
                }
            }
            Spacer(minLength: 28)
        }
        .padding(.bottom, 24)
        .presentationDetents([.fraction(0.36)])
        .presentationDragIndicator(.visible)
    }

    private func composerSheetAction(_ title: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            HStack {
                Text(title)
                    .font(.body)
                    .foregroundStyle(HarnessColors.primary)
                Spacer()
            }
            .frame(minHeight: 52, alignment: .leading)
            .padding(.horizontal, 16)
        }
        .buttonStyle(.plain)
    }

    @ViewBuilder
    private func clarificationPanel(_ clar: ClarificationFixture) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .top, spacing: 8) {
                Text(clar.question)
                    .font(.system(size: 15))
                    .foregroundStyle(HarnessColors.secondary)
                    .frame(maxWidth: .infinity, alignment: .leading)
                Button("取消") { onPreviewAction(.cancelRun) }
                    .font(.system(size: 13))
                    .foregroundStyle(HarnessColors.muted)
            }
            if !clar.options.isEmpty {
                HStack(spacing: 8) {
                    ForEach(clar.options, id: \.self) { opt in
                        Button(opt) { onPreviewAction(.submitClarification(opt)) }
                            .font(.system(size: 13))
                            .buttonStyle(.bordered)
                            .disabled(state.submitting)
                    }
                }
            }
            if clar.allowFreeText {
                HStack(spacing: 8) {
                    TextField("其他…", text: $clarificationAnswer)
                        .font(.system(size: 14))
                        .textFieldStyle(.roundedBorder)
                    Button("提交") { onPreviewAction(.submitClarification(clarificationAnswer)) }
                        .font(.system(size: 14))
                        .foregroundStyle(HarnessColors.link)
                        .disabled(clarificationAnswer.trimmingCharacters(in: .whitespaces).isEmpty || state.submitting)
                }
            }
        }
    }

    @ViewBuilder
    private func toolApprovalPanel(_ fixture: ToolApprovalFixture) -> some View {
        ToolApprovalPanelContent(fixture: fixture, submitting: state.submitting, onPreviewAction: onPreviewAction)
    }

    private var composerBubbleShell: some View {
        VStack(alignment: .leading, spacing: 8) {
            if !state.followUps.isEmpty {
                FollowUpQueuePanelView(
                    items: state.followUps,
                    onSend: { onPreviewAction(.sendFollowUp(id: $0)) },
                    onDismiss: { onPreviewAction(.dismissFollowUp(id: $0)) }
                )
                Divider().overlay(HarnessColors.composerBorder)
            }
            if state.mode == "clarification", let clar = state.clarification {
                clarificationPanel(clar)
            } else if state.mode == "hitl", let approval = state.toolApproval {
                toolApprovalPanel(approval)
            } else {
                ComposerSkillChipsView(skills: state.selectedSkills)
                ComposerAttachmentStripView(fileNames: state.attachmentNames)
                composerInputRow
            }
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 10)
        .background(HarnessColors.surface)
        .clipShape(RoundedRectangle(cornerRadius: HarnessLayout.bubbleRadius, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: HarnessLayout.bubbleRadius, style: .continuous)
                .stroke(HarnessColors.composerBorder, lineWidth: 1)
        )
    }

    private var composerInputRow: some View {
        let enabled = state.composerTextMode != "disabled" && state.mode != "hitl" && composerBlock == .none
        let showModel = state.composerTextMode != "clarification"
        let canSend = enabled && !draft.isEmpty
        let canPressSend = enabled && (canSend || state.submitting)
        let placeholder: String = {
            switch state.composerTextMode {
            case "steer": return "补充方向，将从下一步骤应用……"
            case "clarification": return "回答确认问题以继续……"
            case "disabled": return "正在取消当前任务……"
            default: return "描述你想完成的任务……"
            }
        }()
        return VStack(alignment: .leading, spacing: 8) {
            TextField(placeholder, text: $draft, axis: .vertical)
                .lineLimit(1...HarnessLayout.composerInputMaxLines)
                .font(.system(size: 14))
                .frame(
                    minHeight: HarnessLayout.composerMinInputHeight,
                    maxHeight: HarnessLayout.composerMaxInputHeight,
                    alignment: .topLeading
                )
                .disabled(!enabled)
            HStack(alignment: .center, spacing: 8) {
                Button {
                    attachOpen = true
                } label: {
                    HarnessSymbol.image("plus", size: 20)
                        .frame(width: HarnessLayout.composerPlusSize, height: HarnessLayout.composerPlusSize)
                }
                .buttonStyle(HarnessPressScaleButtonStyle())
                .disabled(!enabled)

                Spacer(minLength: 0)

                if showModel {
                    Button {
                        modelOpen = true
                    } label: {
                        HStack(spacing: 2) {
                            Text(modelChipLabel)
                                .font(.caption)
                                .foregroundStyle(HarnessColors.secondary)
                                .lineLimit(1)
                            HarnessSymbol.image("chevron.down", size: 12)
                                .foregroundStyle(HarnessColors.muted)
                        }
                        .frame(minHeight: HarnessLayout.composerPlusSize)
                        .padding(.horizontal, 8)
                    }
                    .buttonStyle(HarnessPressScaleButtonStyle())
                    .disabled(!enabled)
                }

                Button {
                    if state.submitting && draft.isEmpty {
                        onPreviewAction(.stopRun)
                    } else if canSend {
                        onPreviewAction(.sendComposerText(draft))
                        draft = ""
                    }
                } label: {
                    HarnessSymbol.image("arrow.up", size: 16)
                        .foregroundStyle(HarnessColors.primaryForeground)
                        .frame(width: HarnessLayout.composerSendSize, height: HarnessLayout.composerSendSize)
                        .background(canPressSend ? HarnessColors.primary : HarnessColors.subtle)
                        .clipShape(Circle())
                }
                .buttonStyle(HarnessPressScaleButtonStyle())
                .disabled(!canPressSend)
            }
        }
    }
}

private struct ToolApprovalPanelContent: View {
    let fixture: ToolApprovalFixture
    let submitting: Bool
    let onPreviewAction: (PreviewUiAction) -> Void
    @State private var expandedItemId: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text(fixture.title).font(.headline)
                Spacer()
                Button("取消运行") { onPreviewAction(.cancelRun) }
                    .font(.caption)
            }
            ForEach(fixture.items) { item in
                let expanded = expandedItemId == item.itemId
                VStack(alignment: .leading, spacing: 4) {
                    HStack {
                        Text(item.toolName).font(.caption).foregroundStyle(HarnessColors.muted)
                        Spacer()
                        Button(expanded ? "收起" : "展开") { expandedItemId = expanded ? nil : item.itemId }
                            .font(.caption)
                    }
                    if expanded {
                        Text(item.command).font(.body.monospaced())
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(10)
                .background(HarnessColors.subtle)
                .clipShape(RoundedRectangle(cornerRadius: HarnessLayout.panelRadius))
            }
            if let note = fixture.sandboxNote {
                Text(note).font(.caption2).foregroundStyle(HarnessColors.muted)
            }
            HStack {
                Button("拒绝") { onPreviewAction(.rejectTools) }
                    .frame(maxWidth: .infinity)
                    .disabled(submitting)
                Button("批准执行") { onPreviewAction(.approveTools) }
                    .frame(maxWidth: .infinity)
                    .buttonStyle(.borderedProminent)
                    .disabled(submitting)
            }
        }
        .padding(12)
        .overlay(RoundedRectangle(cornerRadius: HarnessLayout.bubbleRadius).stroke(HarnessColors.composerBorder))
    }
}

struct ComposerBlockBannerView: View {
    let kind: PreviewComposerBlockKind
    var onLoginClick: () -> Void = {}

    var body: some View {
        if kind == .none { EmptyView() }
        else {
            HStack(alignment: .top, spacing: 8) {
                Image(systemName: "info.circle")
                    .foregroundStyle(HarnessColors.secondary)
                Text(message)
                    .font(.caption)
                    .foregroundStyle(HarnessColors.primary)
                    .frame(maxWidth: .infinity, alignment: .leading)
                if kind == .loginRequired {
                    Button("去登录", action: onLoginClick)
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(HarnessColors.link)
                }
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 10)
            .background(HarnessColors.subtle)
            .clipShape(RoundedRectangle(cornerRadius: HarnessLayout.controlRadius, style: .continuous))
        }
    }

    private var message: String {
        switch kind {
        case .none: return ""
        case .loginRequired: return "已配置 API，请先登录后再发送消息。"
        case .transcriptIncompatible: return "当前会话与所选模型不兼容，请新建会话或更换模型。"
        }
    }
}
