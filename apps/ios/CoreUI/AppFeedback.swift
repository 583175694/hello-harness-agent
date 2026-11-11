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

private struct HarnessModalCard<Content: View>: View {
    @Environment(\.colorScheme) private var colorScheme
    @ViewBuilder var content: () -> Content

    var body: some View {
        content()
            .padding(16)
            .frame(maxWidth: 400)
            .background(HarnessColors.surface(colorScheme))
            .clipShape(RoundedRectangle(cornerRadius: HarnessLayout.settingsCardRadius, style: .continuous))
            .padding(.horizontal, 16)
    }
}

private struct HarnessModalActionRow: View {
    @Environment(\.colorScheme) private var colorScheme
    let dismissLabel: String
    let onDismiss: () -> Void
    let confirmLabel: String
    let onConfirm: () -> Void
    var destructive: Bool = false
    var confirmDisabled: Bool = false

    var body: some View {
        HStack(spacing: 12) {
            Button(action: onDismiss) {
                Text(dismissLabel)
                    .font(.body)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 12)
                    .foregroundStyle(HarnessColors.secondary(colorScheme))
                    .background(HarnessColors.subtle(colorScheme))
                    .clipShape(RoundedRectangle(cornerRadius: HarnessLayout.controlRadius, style: .continuous))
            }
            .buttonStyle(HarnessPressScaleButtonStyle())

            Button(action: onConfirm) {
                Text(confirmLabel)
                    .font(.body.weight(.semibold))
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 12)
                    .foregroundStyle(
                        destructive
                            ? Color.white
                            : HarnessColors.primaryForeground(colorScheme)
                    )
                    .background(
                        destructive
                            ? HarnessColors.danger
                            : HarnessColors.primary(colorScheme)
                    )
                    .clipShape(RoundedRectangle(cornerRadius: HarnessLayout.controlRadius, style: .continuous))
            }
            .buttonStyle(HarnessPressScaleButtonStyle())
            .disabled(confirmDisabled)
            .opacity(confirmDisabled ? 0.45 : 1)
        }
        .padding(.top, 4)
    }
}

private struct HarnessConfirmDialogOverlay: View {
    @Environment(\.colorScheme) private var colorScheme
    let request: AppConfirmRequest
    let onDismiss: () -> Void
    @State private var presented = false

    var body: some View {
        ZStack {
            Color.black.opacity(0.25)
                .ignoresSafeArea()
                .opacity(presented ? 1 : 0)
                .onTapGesture(perform: onDismiss)

            HarnessModalCard {
                VStack(alignment: .leading, spacing: 8) {
                    Text(request.title)
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundStyle(HarnessColors.secondary(colorScheme))
                    Text(request.message)
                        .font(.subheadline)
                        .foregroundStyle(HarnessColors.secondary(colorScheme))
                        .fixedSize(horizontal: false, vertical: true)
                    if request.dismissLabel.isEmpty {
                        Button(action: {
                            request.onConfirm()
                            onDismiss()
                        }) {
                            Text(request.confirmLabel)
                                .font(.body.weight(.semibold))
                                .frame(maxWidth: .infinity)
                                .padding(.vertical, 12)
                                .foregroundStyle(
                                    request.destructive
                                        ? Color.white
                                        : HarnessColors.primaryForeground(colorScheme)
                                )
                                .background(
                                    request.destructive
                                        ? HarnessColors.danger
                                        : HarnessColors.primary(colorScheme)
                                )
                                .clipShape(RoundedRectangle(cornerRadius: HarnessLayout.controlRadius, style: .continuous))
                        }
                        .buttonStyle(HarnessPressScaleButtonStyle())
                        .padding(.top, 8)
                    } else {
                        HarnessModalActionRow(
                            dismissLabel: request.dismissLabel,
                            onDismiss: onDismiss,
                            confirmLabel: request.confirmLabel,
                            onConfirm: {
                                request.onConfirm()
                                onDismiss()
                            },
                            destructive: request.destructive
                        )
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            .offset(y: presented ? 0 : 16)
            .opacity(presented ? 1 : 0)
            .scaleEffect(presented ? 1 : 0.96)
        }
        .onAppear {
            withAnimation(.easeOut(duration: 0.24)) {
                presented = true
            }
        }
    }
}

struct AppConfirmDialogModifier: ViewModifier {
    @Binding var request: AppConfirmRequest?

    func body(content: Content) -> some View {
        content.overlay {
            if let request {
                HarnessConfirmDialogOverlay(
                    request: request,
                    onDismiss: { self.request = nil }
                )
            }
        }
    }
}

extension View {
    func appConfirmDialog(_ request: Binding<AppConfirmRequest?>) -> some View {
        modifier(AppConfirmDialogModifier(request: request))
    }
}
