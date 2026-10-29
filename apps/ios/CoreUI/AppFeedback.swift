import SwiftUI

struct AppToastAction {
    let show: (String) -> Void
}

private struct AppToastKey: EnvironmentKey {
    static let defaultValue = AppToastAction { _ in }
}

extension EnvironmentValues {
    var appToast: AppToastAction {
        get { self[AppToastKey.self] }
        set { self[AppToastKey.self] = newValue }
    }
}

struct AppToastHost<Content: View>: View {
    @ViewBuilder var content: () -> Content
    @State private var message: String?
    @State private var hideTask: Task<Void, Never>?

    var body: some View {
        content()
            .environment(\.appToast, AppToastAction { text in
                message = text
                hideTask?.cancel()
                hideTask = Task {
                    try? await Task.sleep(nanoseconds: 2_200_000_000)
                    if !Task.isCancelled {
                        await MainActor.run { message = nil }
                    }
                }
            })
            .overlay(alignment: .bottom) {
                if let message {
                    Text(message)
                        .font(.subheadline)
                        .foregroundStyle(HarnessColors.primaryForeground)
                        .padding(.horizontal, 16)
                        .padding(.vertical, 10)
                        .background(HarnessColors.primary)
                        .clipShape(Capsule())
                        .padding(.bottom, 96)
                        .transition(.move(edge: .bottom).combined(with: .opacity))
                }
            }
            .animation(.easeOut(duration: 0.2), value: message)
    }
}

struct AppConfirmRequest: Identifiable {
    let id = UUID()
    let title: String
    let message: String
    var confirmLabel: String = "确认"
    var dismissLabel: String = "取消"
    var destructive: Bool = false
    let onConfirm: () -> Void
}

struct AppConfirmDialogModifier: ViewModifier {
    @Binding var request: AppConfirmRequest?

    func body(content: Content) -> some View {
        content.alert(
            request?.title ?? "",
            isPresented: Binding(
                get: { request != nil },
                set: { if !$0 { request = nil } }
            ),
            presenting: request
        ) { req in
            Button(req.confirmLabel, role: req.destructive ? .destructive : nil) {
                req.onConfirm()
                request = nil
            }
            if !req.dismissLabel.isEmpty {
                Button(req.dismissLabel, role: .cancel) {
                    request = nil
                }
            }
        } message: { req in
            Text(req.message)
        }
    }
}

extension View {
    func appConfirmDialog(_ request: Binding<AppConfirmRequest?>) -> some View {
        modifier(AppConfirmDialogModifier(request: request))
    }
}
