import SwiftUI

struct ServiceBannerView: View {
    let serviceState: String
    let onRetry: () -> Void
    let onDismiss: () -> Void
    @Environment(\.colorScheme) private var colorScheme

    var body: some View {
        if serviceState == "ready" { EmptyView() } else {
            HStack(alignment: .center, spacing: 8) {
                ZStack {
                    Circle()
                        .fill(HarnessColors.danger)
                        .frame(width: 18, height: 18)
                    Text("!")
                        .font(.system(size: 12, weight: .bold))
                        .foregroundStyle(HarnessColors.primaryForeground(colorScheme))
                }
                Text(message)
                    .font(.system(size: 13))
                    .foregroundStyle(barForeground)
                    .lineLimit(2)
                    .frame(maxWidth: .infinity, alignment: .leading)
                if serviceState == "unavailable" {
                    Button("重新连接", action: onRetry)
                        .font(.system(size: 13))
                        .foregroundStyle(HarnessColors.link(colorScheme))
                }
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 9)
            .frame(maxWidth: .infinity)
            .background(barBackground)
        }
    }

    private var message: String {
        serviceState == "checking"
            ? "正在检查服务状态…"
            : "当前无法连接服务，请检查网络与 API 地址。"
    }

    private var barBackground: Color {
        colorScheme == .dark ? Color(red: 0.16, green: 0.13, blue: 0.13) : Color(red: 0.99, green: 0.93, blue: 0.92)
    }

    private var barForeground: Color {
        colorScheme == .dark ? Color(red: 0.77, green: 0.72, blue: 0.71) : Color(red: 0.42, green: 0.36, blue: 0.34)
    }
}

struct ProblemDetailsCardView: View {
    let title: String?
    let detail: String?

    @Environment(\.colorScheme) private var colorScheme

    var body: some View {
        if (title ?? "").isEmpty && (detail ?? "").isEmpty {
            EmptyView()
        } else {
            VStack(alignment: .leading, spacing: 4) {
                if let title, !title.isEmpty {
                    Text(title).font(.headline)
                }
                if let detail, !detail.isEmpty {
                    Text(detail).font(.body)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(12)
            .background(HarnessColors.subtle(colorScheme))
            .clipShape(RoundedRectangle(cornerRadius: 12))
            .padding(.horizontal, 12)
            .padding(.vertical, 6)
        }
    }
}
