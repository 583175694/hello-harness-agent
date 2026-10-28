import SwiftUI

enum ComposerModelMenuLabels {
    struct ModelDef: Identifiable {
        let id: String
        let label: String
        let reasoningOptions: [String]
    }

    static let models: [ModelDef] = [
        ModelDef(id: "deepseek-chat", label: "DeepSeek Chat", reasoningOptions: ["off", "low", "high"]),
        ModelDef(id: "deepseek-reasoner", label: "DeepSeek Reasoner", reasoningOptions: ["low", "high", "max"]),
        ModelDef(id: "fast", label: "快速", reasoningOptions: ["off"]),
    ]

    static func reasoningShortLabel(_ effort: String) -> String {
        switch effort {
        case "off": return "无"
        case "low": return "轻"
        case "high": return "中"
        case "max": return "高"
        default: return "中"
        }
    }

    static func chipLabel(modelId: String, effort: String) -> String {
        let name = models.first(where: { $0.id == modelId })?.label ?? modelId
        return "\(name) · \(reasoningShortLabel(effort))"
    }

    static func resolveModelId(from label: String) -> String {
        let lower = label.lowercased()
        if lower.contains("reasoner") { return "deepseek-reasoner" }
        if label.contains("快速") || lower.contains("fast") { return "fast" }
        return "deepseek-chat"
    }

    static func resolveReasoning(from label: String) -> String {
        if label.contains("Reasoner"), label.contains("高") { return "max" }
        if label.contains("高") { return "high" }
        if label.contains("轻") { return "low" }
        if label.contains("无") { return "off" }
        return "high"
    }

    static func coerceReasoning(modelId: String, effort: String) -> String {
        let allowed = models.first(where: { $0.id == modelId })?.reasoningOptions ?? ["high"]
        return allowed.contains(effort) ? effort : (allowed.last ?? "high")
    }
}

struct ComposerModelMenuSheetView: View {
    @Binding var selectedModelId: String
    @Binding var reasoningEffort: String

    private var activeModel: ComposerModelMenuLabels.ModelDef {
        ComposerModelMenuLabels.models.first(where: { $0.id == selectedModelId })
            ?? ComposerModelMenuLabels.models[0]
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            ForEach(ComposerModelMenuLabels.models) { model in
                Button {
                    selectedModelId = model.id
                    reasoningEffort = ComposerModelMenuLabels.coerceReasoning(
                        modelId: model.id,
                        effort: reasoningEffort
                    )
                } label: {
                    HStack {
                        Text(model.label)
                            .font(.body)
                            .foregroundStyle(
                                model.id == selectedModelId ? HarnessColors.primary : HarnessColors.secondary
                            )
                        Spacer()
                        if model.id == selectedModelId {
                            Image(systemName: "checkmark")
                                .font(.body.weight(.semibold))
                                .foregroundStyle(HarnessColors.link)
                        }
                    }
                    .frame(minHeight: 48, alignment: .leading)
                    .padding(.horizontal, 16)
                }
                .buttonStyle(.plain)
            }

            Text("思考强度")
                .font(.caption)
                .foregroundStyle(HarnessColors.muted)
                .padding(.horizontal, 16)
                .padding(.top, 16)
                .padding(.bottom, 10)

            ComposerReasoningSegmentedControl(
                options: activeModel.reasoningOptions,
                selection: $reasoningEffort
            )
            .padding(.horizontal, 12)

            Spacer(minLength: 28)
        }
        .padding(.bottom, 24)
    }
}

private struct ComposerReasoningSegmentedControl: View {
    let options: [String]
    @Binding var selection: String

    var body: some View {
        HStack(spacing: 4) {
            ForEach(options, id: \.self) { option in
                let selected = option == selection
                Button {
                    selection = option
                } label: {
                    Text(ComposerModelMenuLabels.reasoningShortLabel(option))
                        .font(.caption.weight(selected ? .semibold : .regular))
                        .foregroundStyle(selected ? HarnessColors.primaryForeground : HarnessColors.secondary)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 8)
                        .background(selected ? HarnessColors.primary : Color.clear)
                        .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
                }
                .buttonStyle(.plain)
            }
        }
        .padding(4)
        .background(HarnessColors.subtle)
        .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
    }
}
