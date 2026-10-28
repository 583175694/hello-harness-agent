import SwiftUI

struct ComposerPeekBarView: View {
    let title: String
    let subtitle: String?
    let onPress: () -> Void

    var body: some View {
        Button(action: onPress) {
            HStack {
                Circle().fill(HarnessColors.link).frame(width: 8, height: 8)
                VStack(alignment: .leading, spacing: 2) {
                    Text(title).font(.subheadline)
                    if let subtitle, !subtitle.isEmpty {
                        Text(subtitle).font(.caption).foregroundStyle(HarnessColors.muted)
                    }
                }
                Spacer()
                Text("›").font(.caption)
            }
            .padding(12)
            .background(HarnessColors.surface)
            .overlay(RoundedRectangle(cornerRadius: 12).stroke(HarnessColors.border))
        }
        .buttonStyle(.plain)
        .padding(.horizontal, 12)
        .padding(.vertical, 4)
    }
}

struct PlanFloatingCardView: View {
    let plan: PlanFixture
    var lockCollapsed: Bool = false
    @State private var expanded: Bool

    init(plan: PlanFixture, lockCollapsed: Bool = false) {
        self.plan = plan
        self.lockCollapsed = lockCollapsed
        _expanded = State(initialValue: plan.initialExpanded)
    }

    private var activeIndex: Int {
        let steps = plan.steps
        if let idx = steps.firstIndex(where: { $0.status == "in_progress" }) {
            return idx
        }
        return max(steps.lastIndex(where: { $0.status == "completed" }) ?? 0, 0)
    }

    var body: some View {
        let steps = plan.steps
        if steps.isEmpty || steps.allSatisfy({ $0.status == "completed" }) {
            EmptyView()
        } else {
            VStack(spacing: 0) {
                if expanded && !lockCollapsed {
                    ScrollView {
                        VStack(alignment: .leading, spacing: 6) {
                            if let explanation = plan.explanation {
                                Text(explanation)
                                    .font(.caption)
                                    .foregroundStyle(HarnessColors.muted)
                                    .padding(.bottom, 4)
                            }
                            ForEach(plan.steps) { step in
                                HStack(alignment: .top, spacing: 8) {
                                    planStepIcon(status: step.status)
                                        .frame(width: 16, height: 16)
                                        .padding(.top, 2)
                                    Text(step.step)
                                        .font(.subheadline)
                                        .foregroundStyle(stepTextColor(step.status))
                                }
                                .padding(.vertical, 2)
                            }
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                    }
                    .frame(maxHeight: 280)
                    .padding(.horizontal, 14)
                    .padding(.vertical, 12)
                    .background(HarnessColors.surface)
                    .overlay(RoundedRectangle(cornerRadius: HarnessLayout.panelRadius).stroke(HarnessColors.composerBorder))
                    .clipShape(RoundedRectangle(cornerRadius: HarnessLayout.panelRadius))
                    .padding(.bottom, 8)
                    .shadow(color: .black.opacity(0.08), radius: 8, y: 2)
                    .transition(.opacity.combined(with: .move(edge: .bottom)))
                    .frame(maxWidth: 360)
                    .frame(maxWidth: .infinity)
                }

                Button {
                    guard !lockCollapsed else { return }
                    withAnimation(.easeOut(duration: 0.2)) { expanded.toggle() }
                } label: {
                    HStack(spacing: 8) {
                        ProgressView()
                            .scaleEffect(0.65)
                        Text("第 \(min(activeIndex + 1, steps.count)) / \(steps.count) 步")
                            .font(.subheadline.weight(.semibold))
                            .foregroundStyle(HarnessColors.primary)
                    }
                    .padding(.horizontal, 16)
                    .padding(.vertical, 8)
                    .frame(minHeight: 38)
                    .background(HarnessColors.surface)
                    .clipShape(Capsule())
                    .overlay(Capsule().stroke(HarnessColors.composerBorder))
                    .shadow(color: .black.opacity(0.08), radius: 6, y: 2)
                }
                .buttonStyle(.plain)
                .accessibilityLabel("执行计划，第 \(activeIndex + 1) / \(steps.count) 步")
            }
            .frame(maxWidth: .infinity)
            .padding(.horizontal, HarnessLayout.planOverlayHorizontalInset)
        }
    }

    @ViewBuilder
    private func planStepIcon(status: String) -> some View {
        switch status {
        case "completed":
            Image(systemName: "checkmark")
                .font(.caption.weight(.semibold))
                .foregroundStyle(HarnessColors.muted)
        case "in_progress":
            ProgressView()
                .scaleEffect(0.55)
        default:
            Circle()
                .strokeBorder(HarnessColors.muted, lineWidth: 1)
                .frame(width: 10, height: 10)
        }
    }

    private func stepTextColor(_ status: String) -> Color {
        switch status {
        case "completed": return HarnessColors.muted
        case "in_progress": return HarnessColors.primary
        default: return HarnessColors.secondary
        }
    }
}

struct ComposerModelSheetSnapshotView: View {
    var body: some View {
        NavigationStack {
            List(["默认模型", "推理 · 高", "快速"], id: \.self) { option in
                Text(option)
            }
            .navigationTitle("模型")
        }
    }
}

struct ComposerAttachmentSheetSnapshotView: View {
    var body: some View {
        NavigationStack {
            VStack(alignment: .leading, spacing: 8) {
                Text("Preview 静态附件 Sheet").font(.subheadline)
                Text("screenshot.png").font(.body)
            }
            .padding()
            .navigationTitle("附件")
        }
    }
}

struct ComposerSkillSheetSnapshotView: View {
    var body: some View {
        NavigationStack {
            List(["/research", "/code-review", "/summarize"], id: \.self) { skill in
                Text(skill)
            }
            .navigationTitle("Skill")
        }
    }
}

struct ComposerOverlayHostView: View {
    let modelLabel: String
    @State private var localModel: String
    @State private var modelOpen = false
    @State private var attachOpen = false
    @State private var skillOpen = false

    init(modelLabel: String) {
        self.modelLabel = modelLabel
        _localModel = State(initialValue: modelLabel)
    }

    var body: some View {
        HStack(spacing: 8) {
            chip(localModel) { modelOpen = true }
            chip("附件") { attachOpen = true }
            chip("Skill") { skillOpen = true }
        }
        .sheet(isPresented: $modelOpen) {
            NavigationStack {
                List(["默认模型", "推理 · 高", "快速"], id: \.self) { option in
                    Button(option) {
                        localModel = option
                        modelOpen = false
                    }
                }
                .navigationTitle("模型")
            }
        }
        .sheet(isPresented: $attachOpen) {
            NavigationStack {
                Text("Preview 静态附件 Sheet").padding()
                    .navigationTitle("附件")
            }
        }
        .sheet(isPresented: $skillOpen) {
            NavigationStack {
                List(["/research", "/code-review", "/summarize"], id: \.self) { skill in
                    Button(skill) { skillOpen = false }
                }
                .navigationTitle("Skill")
            }
        }
    }

    private func chip(_ label: String, action: @escaping () -> Void) -> some View {
        Button(label, action: action)
            .font(.caption)
            .padding(.horizontal, 10)
            .padding(.vertical, 6)
            .background(HarnessColors.subtle)
            .clipShape(Capsule())
    }
}
