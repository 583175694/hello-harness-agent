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

/// 横向附件条：图片 / 文件统一高度。
struct ComposerAttachmentStripView: View {
    let fileNames: [String]

    private let stripHeight: CGFloat = 52
    private let fileMaxWidth: CGFloat = 216

    var body: some View {
        if fileNames.isEmpty { EmptyView() } else {
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 6) {
                    ForEach(fileNames, id: \.self) { name in
                        ComposerAttachmentCardView(
                            fileName: name,
                            stripHeight: stripHeight,
                            fileMaxWidth: fileMaxWidth
                        )
                    }
                }
            }
            .frame(height: stripHeight)
        }
    }
}

private struct ComposerAttachmentCardView: View {
    let fileName: String
    let stripHeight: CGFloat
    let fileMaxWidth: CGFloat

    var body: some View {
        let isImage = isImageAttachment(fileName)
        if isImage {
            ZStack {
                RoundedRectangle(cornerRadius: 8, style: .continuous)
                    .fill(HarnessColors.subtle)
                RoundedRectangle(cornerRadius: 8, style: .continuous)
                    .stroke(HarnessColors.composerBorder, lineWidth: 1)
                Text("IMG").font(.caption2).foregroundStyle(HarnessColors.muted)
            }
            .frame(width: stripHeight, height: stripHeight)
        } else {
            HStack(spacing: 8) {
                Text(fileExtensionLabel(fileName))
                    .font(.system(size: 9, weight: .bold))
                    .foregroundStyle(HarnessColors.link)
                    .frame(width: 32, height: 32)
                    .background(HarnessColors.canvas)
                    .clipShape(RoundedRectangle(cornerRadius: 4, style: .continuous))
                Text(fileName)
                    .font(.subheadline.weight(.medium))
                    .foregroundStyle(HarnessColors.primary)
                    .lineLimit(1)
                    .frame(maxWidth: fileMaxWidth - 72, alignment: .leading)
                Image(systemName: "xmark")
                    .font(.system(size: 10, weight: .semibold))
                    .foregroundStyle(HarnessColors.muted)
            }
            .padding(.horizontal, 8)
            .frame(height: stripHeight)
            .frame(maxWidth: fileMaxWidth)
            .background(HarnessColors.subtle)
            .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: 8, style: .continuous)
                    .stroke(HarnessColors.composerBorder, lineWidth: 1)
            )
        }
    }

    private func isImageAttachment(_ name: String) -> Bool {
        let lower = name.lowercased()
        return lower.hasSuffix(".png") || lower.hasSuffix(".jpg") || lower.hasSuffix(".jpeg") || lower.hasSuffix(".webp")
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
