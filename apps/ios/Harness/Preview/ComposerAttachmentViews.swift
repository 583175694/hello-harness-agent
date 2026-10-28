import SwiftUI

struct ComposerSkillChipsView: View {
    let skills: [String]

    var body: some View {
        if skills.isEmpty { EmptyView() } else {
            FlowLayout(spacing: 6) {
                ForEach(skills, id: \.self) { name in
                    HStack(spacing: 4) {
                        Text("▣").font(.caption).foregroundStyle(HarnessColors.link)
                        Text(name).font(.caption).foregroundStyle(HarnessColors.link)
                    }
                    .padding(.horizontal, 8)
                    .padding(.vertical, 4)
                    .background(HarnessColors.subtle)
                    .clipShape(Capsule())
                    .overlay(Capsule().stroke(HarnessColors.composerBorder, lineWidth: 1))
                }
            }
        }
    }
}

/// 简易横向附件条（对齐 RN ComposerAttachments 文件卡片形态）
struct ComposerAttachmentStripView: View {
    let fileNames: [String]

    var body: some View {
        if fileNames.isEmpty { EmptyView() } else {
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    ForEach(fileNames, id: \.self) { name in
                        ComposerAttachmentCardView(fileName: name)
                    }
                }
                .padding(.vertical, 2)
            }
        }
    }
}

private struct ComposerAttachmentCardView: View {
    let fileName: String

    var body: some View {
        let lower = fileName.lowercased()
        let isImage = lower.hasSuffix(".png") || lower.hasSuffix(".jpg") || lower.hasSuffix(".jpeg") || lower.hasSuffix(".webp")
        if isImage {
            ZStack {
                RoundedRectangle(cornerRadius: 8, style: .continuous)
                    .stroke(HarnessColors.composerBorder, lineWidth: 1)
                    .background(HarnessColors.subtle)
                Text("IMG").font(.caption).foregroundStyle(HarnessColors.muted)
            }
            .frame(width: 64, height: 64)
        } else {
            HStack(spacing: 10) {
                Text(fileExtensionLabel(fileName))
                    .font(.system(size: 10, weight: .bold))
                    .foregroundStyle(HarnessColors.link)
                    .frame(width: 40, height: 40)
                    .background(HarnessColors.canvas)
                    .clipShape(RoundedRectangle(cornerRadius: 4, style: .continuous))
                VStack(alignment: .leading, spacing: 2) {
                    Text(fileName)
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(HarnessColors.primary)
                        .lineLimit(1)
                    Text("Preview")
                        .font(.caption)
                        .foregroundStyle(HarnessColors.muted)
                }
                .frame(maxWidth: 180, alignment: .leading)
            }
            .padding(.horizontal, 12)
            .frame(height: 72)
            .background(HarnessColors.subtle)
            .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: 8, style: .continuous)
                    .stroke(HarnessColors.composerBorder, lineWidth: 1)
            )
        }
    }

    private func fileExtensionLabel(_ name: String) -> String {
        guard let dot = name.lastIndex(of: ".") else { return "FILE" }
        let ext = name[name.index(after: dot)...]
        return String(ext).uppercased().prefix(4).description
    }
}

/// 轻量 flow layout（Skill chips）
private struct FlowLayout: Layout {
    var spacing: CGFloat = 8

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let result = arrange(proposal: proposal, subviews: subviews)
        return result.size
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        let result = arrange(proposal: proposal, subviews: subviews)
        for (index, frame) in result.frames.enumerated() {
            subviews[index].place(at: CGPoint(x: bounds.minX + frame.minX, y: bounds.minY + frame.minY), proposal: .unspecified)
        }
    }

    private func arrange(proposal: ProposedViewSize, subviews: Subviews) -> (size: CGSize, frames: [CGRect]) {
        let maxWidth = proposal.width ?? 320
        var x: CGFloat = 0
        var y: CGFloat = 0
        var rowHeight: CGFloat = 0
        var frames: [CGRect] = []
        for subview in subviews {
            let size = subview.sizeThatFits(.unspecified)
            if x + size.width > maxWidth, x > 0 {
                x = 0
                y += rowHeight + spacing
                rowHeight = 0
            }
            frames.append(CGRect(x: x, y: y, width: size.width, height: size.height))
            rowHeight = max(rowHeight, size.height)
            x += size.width + spacing
        }
        return (CGSize(width: maxWidth, height: y + rowHeight), frames)
    }
}
