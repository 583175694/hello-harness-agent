import SwiftUI

struct ChatTopBarView: View {
    let title: String
    let connectionState: String
    let runSummary: String?
    var workbenchBadge: Int = 0
    let onOpenDrawer: () -> Void
    let onOpenWorkbench: () -> Void

    var body: some View {
        HStack {
                Button(action: onOpenDrawer) {
                    HarnessSymbol.image("line.3.horizontal", size: 22)
                        .foregroundStyle(HarnessColors.primary)
                }
                .buttonStyle(HarnessTopBarIconButtonStyle())
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
                    HarnessSymbol.image("sidebar.right", size: 20)
                        .foregroundStyle(HarnessColors.primary)
                }
                .buttonStyle(HarnessTopBarIconButtonStyle())
                .accessibilityLabel("打开工作台")
            }
            .frame(height: 40)
            .padding(.horizontal, 4)
            .padding(.bottom, 2)
            .background(HarnessColors.canvas)
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
