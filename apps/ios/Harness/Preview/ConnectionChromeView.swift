import SwiftUI

struct ServiceBannerView: View {
    let serviceState: String
    let onRetry: () -> Void
    let onDismiss: () -> Void

    var body: some View {
        if serviceState == "ready" { EmptyView() } else {
            VStack(alignment: .leading, spacing: 6) {
                Text(message).font(.subheadline)
                HStack {
                    if serviceState == "unavailable" {
                        Button("重新连接", action: onRetry).font(.caption)
                    }
                    Button("关闭", action: onDismiss).font(.caption).foregroundStyle(HarnessColors.muted)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, 12)
            .padding(.vertical, 8)
            .background(HarnessColors.danger.opacity(0.12))
        }
    }

    private var message: String {
        serviceState == "checking"
            ? "正在检查服务状态…"
            : "无法连接 Agent 服务，请检查 API 地址或网络。"
    }
}

struct ProblemDetailsCardView: View {
    let title: String?
    let detail: String?

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
            .background(HarnessColors.subtle)
            .clipShape(RoundedRectangle(cornerRadius: 12))
            .padding(.horizontal, 12)
            .padding(.vertical, 6)
        }
    }
}
