import SwiftUI

/// 对齐 Web `.pending-input-card`：单行 + ghost 操作钮。
struct FollowUpQueuePanelView: View {
    let items: [FollowUpFixture]
    var onSend: (String) -> Void = { _ in }
    var onDismiss: (String) -> Void = { _ in }

    private let rowMinHeight: CGFloat = 36
    private let actionSize: CGFloat = 28

    var body: some View {
        VStack(spacing: 0) {
            ForEach(Array(items.enumerated()), id: \.element.id) { index, item in
                if index > 0 {
                    Divider().overlay(HarnessColors.composerBorder)
                }
                HStack(alignment: .center, spacing: 8) {
                    Image(systemName: "arrow.turn.down.left")
                        .font(.system(size: 14, weight: .medium))
                        .foregroundStyle(HarnessColors.muted)
                    Text(item.content)
                        .font(.system(size: 13))
                        .foregroundStyle(HarnessColors.primary)
                        .lineLimit(1)
                        .truncationMode(.tail)
                        .frame(maxWidth: .infinity, alignment: .leading)
                    HStack(spacing: 4) {
                        followUpGhostButton(
                            systemName: "arrow.up",
                            label: "发送跟进",
                            tint: HarnessColors.secondary,
                            action: { onSend(item.id) }
                        )
                        followUpGhostButton(
                            systemName: "xmark",
                            label: "移除跟进",
                            tint: HarnessColors.muted,
                            action: { onDismiss(item.id) }
                        )
                    }
                }
                .frame(minHeight: rowMinHeight)
                .padding(.horizontal, 12)
                .padding(.vertical, 4)
            }
        }
    }

    private func followUpGhostButton(
        systemName: String,
        label: String,
        tint: Color,
        action: @escaping () -> Void
    ) -> some View {
        Button(action: action) {
            Image(systemName: systemName)
                .font(.system(size: 13, weight: .semibold))
                .foregroundStyle(tint)
                .frame(width: actionSize, height: actionSize)
        }
        .buttonStyle(.plain)
        .accessibilityLabel(label)
    }
}
