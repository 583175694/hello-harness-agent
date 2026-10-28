import SwiftUI

struct ChatTopBarView: View {
    let title: String
    let connectionState: String
    let runSummary: String?
    var workbenchBadge: Int = 0
    let onOpenDrawer: () -> Void
    let onOpenWorkbench: () -> Void

    var body: some View {
        VStack(spacing: 0) {
            HStack {
                Button(action: onOpenDrawer) {
                    Image(systemName: "line.3.horizontal")
                        .font(.system(size: 20, weight: .medium))
                        .foregroundStyle(HarnessColors.primary)
                }
                .frame(width: HarnessLayout.iconToolbarSize, height: HarnessLayout.iconToolbarSize)
                .accessibilityLabel("打开会话列表")

                Text(title)
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(HarnessColors.primary)
                    .lineLimit(1)
                    .frame(maxWidth: .infinity)

                if connectionState != "live", connectionState != "idle" {
                    Text(connectionLabel)
                        .font(.caption2)
                        .padding(.horizontal, 8)
                        .padding(.vertical, 2)
                        .background(HarnessColors.subtle)
                        .clipShape(Capsule())
                }

                Button(action: onOpenWorkbench) {
                    Image(systemName: "rectangle.split.3x1")
                        .font(.system(size: 20, weight: .medium))
                        .foregroundStyle(HarnessColors.primary)
                }
                .frame(width: HarnessLayout.iconToolbarSize, height: HarnessLayout.iconToolbarSize)
                .accessibilityLabel("打开工作台")
            }
            .frame(height: 40)
            .padding(.horizontal, 4)
            .padding(.bottom, 2)
            .background(HarnessColors.canvas)

            Divider().overlay(HarnessColors.composerBorder.opacity(0.8))
        }
    }

    private var connectionLabel: String {
        switch connectionState {
        case "offline": return "离线"
        case "reconnecting": return "重连中"
        case "connecting": return "连接中"
        default: return connectionState
        }
    }
}
