import SwiftUI

struct ChatTopBarView: View {
    let title: String
    let connectionState: String
    let runSummary: String?
    var workbenchBadge: Int = 0
    let onOpenDrawer: () -> Void
    let onNewConversation: () -> Void
    let onOpenWorkbench: () -> Void
    @Environment(\.colorScheme) private var colorScheme

    private let chromeSize: CGFloat = 40
    private let iconSize: CGFloat = 22
    private let chromeShadowOpacity: Double = 0.03
    private let chromeShadowRadius: CGFloat = 3
    private let chromeShadowY: CGFloat = 1

    var body: some View {
        HStack(spacing: 0) {
            Button(action: onOpenDrawer) {
                Image("harness_chat_top_sessions")
                    .resizable()
                    .scaledToFit()
                    .frame(width: iconSize, height: iconSize)
            }
            .buttonStyle(HarnessPressScaleButtonStyle())
            .frame(width: chromeSize, height: chromeSize)
            .background(HarnessColors.surface(colorScheme))
            .clipShape(Circle())
            .shadow(color: Color.black.opacity(chromeShadowOpacity), radius: chromeShadowRadius, x: 0, y: chromeShadowY)
            .accessibilityLabel("打开会话列表")

            Text(title)
                .font(.system(size: 17, weight: .semibold))
                .foregroundStyle(HarnessColors.primary(colorScheme))
                .lineLimit(1)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.leading, 12)
                .padding(.trailing, 8)

            if connectionState != "live", connectionState != "idle" {
                Text(connectionLabel)
                    .font(.caption2)
                    .padding(.horizontal, 8)
                    .padding(.vertical, 2)
                    .background(HarnessColors.subtle(colorScheme))
                    .clipShape(Capsule())
            }

            HStack(spacing: 2) {
                Button(action: onNewConversation) {
                    Image("harness_chat_top_new_chat")
                        .resizable()
                        .scaledToFit()
                        .frame(width: iconSize, height: iconSize)
                        .frame(width: chromeSize, height: chromeSize)
                }
                .buttonStyle(HarnessPressScaleButtonStyle())
                .accessibilityLabel("新建会话")

                Button(action: onOpenWorkbench) {
                    Image("harness_chat_top_workbench")
                        .resizable()
                        .scaledToFit()
                        .frame(width: iconSize, height: iconSize)
                        .frame(width: chromeSize, height: chromeSize)
                }
                .buttonStyle(HarnessPressScaleButtonStyle())
                .accessibilityLabel("打开工作台")
            }
            .padding(.horizontal, 4)
            .background(HarnessColors.surface(colorScheme))
            .clipShape(Capsule(style: .continuous))
            .shadow(color: Color.black.opacity(chromeShadowOpacity), radius: chromeShadowRadius, x: 0, y: chromeShadowY)
        }
        .frame(height: 40)
        .padding(.horizontal, 12)
        .padding(.bottom, 6)
        .background(HarnessColors.canvas(colorScheme))
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
