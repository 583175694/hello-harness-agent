import SwiftUI
import UIKit

struct PreviewSettingsRootView: View {
    @Bindable var preferences: PreviewAppPreferences
    var onOpenPreviewScenarios: () -> Void = {}
    var onOpenLogin: () -> Void = {}
    var onOpenMemory: () -> Void = {}
    var onOpenMcp: () -> Void = {}
    var onOpenConnection: () -> Void = {}
    @Environment(\.appToast) private var appToast
    @Environment(\.colorScheme) private var colorScheme

    var body: some View {
        AppScaffold(title: "设置") {
            VStack(spacing: 0) {
            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    settingsGroup(sectionLabel: "通用") {
                        Button {
                            preferences.themeMode = nextThemeMode(preferences.themeMode)
                        } label: {
                            settingsNavRowLabel(title: "外观", trailing: themeModeLabel(preferences.themeMode))
                                .padding(.horizontal, 16)
                                .frame(minHeight: settingsRowMinHeight)
                        }
                        .buttonStyle(HarnessPressScaleButtonStyle())
                        settingsSoftDivider()
                        settingsFontSizeRow(
                            value: preferences.contentFontSize,
                            onDecrement: { preferences.contentFontSize = max(13, preferences.contentFontSize - 1) },
                            onIncrement: { preferences.contentFontSize = min(20, preferences.contentFontSize + 1) }
                        )
                        settingsSoftDivider()
                        Toggle(isOn: $preferences.reduceMotion) {
                            Text("Reduce Motion")
                                .foregroundStyle(HarnessColors.secondary(colorScheme))
                        }
                        .tint(HarnessColors.primary(colorScheme))
                        .padding(.horizontal, 16)
                        .frame(minHeight: settingsRowMinHeight)
                        settingsSoftDivider()
                        if preferences.isLoggedIn, let profile = preferences.authProfile {
                            settingsNavRowLabel(title: profile.displayName, trailing: profile.phone, showChevron: false)
                                .padding(.horizontal, 16)
                                .frame(minHeight: settingsRowMinHeight)
                        } else {
                            Button(action: onOpenLogin) {
                                settingsNavRowLabel(title: "登录", trailing: nil)
                                    .padding(.horizontal, 16)
                                    .frame(minHeight: settingsRowMinHeight)
                            }
                            .buttonStyle(HarnessPressScaleButtonStyle())
                        }
                    }

                    settingsGroup(sectionLabel: "开发") {
                        Toggle(isOn: Binding(
                            get: { preferences.composerBlockDemo == .transcriptIncompatible },
                            set: { on in preferences.composerBlockDemo = on ? .transcriptIncompatible : .none }
                        )) {
                            Text("Composer 阻断")
                                .font(.body)
                                .foregroundStyle(HarnessColors.secondary(colorScheme))
                        }
                        .tint(HarnessColors.primary(colorScheme))
                        .padding(.horizontal, 16)
                        .frame(minHeight: settingsRowMinHeight)
                    }

                    settingsGroup(sectionLabel: "Agent") {
                        settingsNavRowButton(title: "记忆", action: onOpenMemory)
                        settingsNavRowButton(title: "MCP 服务器", showDividerAfter: true, action: onOpenMcp)
                        Button(action: onOpenPreviewScenarios) {
                            settingsNavRowLabel(title: "演示场景", trailing: nil)
                                .padding(.horizontal, 16)
                                .frame(minHeight: settingsRowMinHeight)
                        }
                        .buttonStyle(HarnessPressScaleButtonStyle())
                    }

                    settingsGroup(sectionLabel: "连接") {
                        Button(action: onOpenConnection) {
                            settingsNavRowLabel(
                                title: "API Base URL",
                                trailing: apiConnectionSummary(preferences.apiBaseUrl)
                            )
                            .padding(.horizontal, 16)
                            .frame(minHeight: settingsRowMinHeight)
                        }
                        .buttonStyle(HarnessPressScaleButtonStyle())
                    }

                }
                .padding(.vertical, 8)
            }
            if preferences.isLoggedIn {
                settingsPillButton("退出登录", style: .subtle) {
                    preferences.updateAuthProfile(nil)
                    appToast.show("已退出登录")
                }
                .padding(.top, 12)
                .padding(.bottom, 8)
            }
            }
        }
    }

    private func settingsFontSizeRow(value: Int, onDecrement: @escaping () -> Void, onIncrement: @escaping () -> Void) -> some View {
        HStack {
            Text("正文字号")
                .font(.body)
                .foregroundStyle(HarnessColors.secondary(colorScheme))
            Spacer()
            HStack(spacing: 0) {
                Button("−", action: onDecrement)
                    .font(.system(size: 15))
                    .foregroundStyle(HarnessColors.secondary(colorScheme))
                    .padding(.horizontal, 10)
                    .padding(.vertical, 4)
                Text("\(value)")
                    .font(.system(size: 14))
                    .foregroundStyle(HarnessColors.muted(colorScheme))
                    .padding(.horizontal, 6)
                Button("+", action: onIncrement)
                    .font(.system(size: 15))
                    .foregroundStyle(HarnessColors.secondary(colorScheme))
                    .padding(.horizontal, 10)
                    .padding(.vertical, 4)
            }
            .background(HarnessColors.subtle(colorScheme))
            .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
        }
        .padding(.horizontal, 16)
        .frame(minHeight: settingsRowMinHeight)
    }

    private func themeModeLabel(_ mode: PreviewThemeMode) -> String {
        switch mode {
        case .system: return "跟随系统"
        case .light: return "浅色"
        case .dark: return "深色"
        }
    }

    private func nextThemeMode(_ mode: PreviewThemeMode) -> PreviewThemeMode {
        switch mode {
        case .system: return .light
        case .light: return .dark
        case .dark: return .system
        }
    }
}

struct PreviewConnectionSettingsView: View {
    @Bindable var preferences: PreviewAppPreferences
    @Environment(\.colorScheme) private var colorScheme

    var body: some View {
        VStack(spacing: 0) {
            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    settingsGroup {
                        VStack(alignment: .leading, spacing: 8) {
                            settingsTextField(
                                label: "API Base URL",
                                text: $preferences.apiBaseUrl,
                                placeholder: "http://192.168.x.x:4318"
                            )
                        }
                        .padding(16)
                    }
                }
                .padding(.vertical, 8)
            }
        }
        .background(HarnessColors.canvas(colorScheme))
        .navigationTitle("连接")
        .navigationBarTitleDisplayMode(.inline)
    }
}

struct PreviewMcpListView: View {
    @Bindable var preferences: PreviewAppPreferences
    var onAddServer: () -> Void = {}
    var onEditServer: (String) -> Void = { _ in }
    @Environment(\.colorScheme) private var colorScheme

    var body: some View {
        VStack(spacing: 0) {
            ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                settingsGroup(sectionLabel: "已配置") {
                    if preferences.mcpServers.isEmpty {
                        Text("暂无服务器")
                            .font(.caption)
                            .foregroundStyle(HarnessColors.muted(colorScheme))
                            .padding(.horizontal, 16)
                            .frame(minHeight: settingsRowMinHeight, alignment: .leading)
                    } else {
                        ForEach(Array(preferences.mcpServers.enumerated()), id: \.element.id) { index, server in
                            VStack(spacing: 0) {
                                Button {
                                    onEditServer(server.id)
                                } label: {
                                    settingsNavRowLabel(
                                        title: server.serverName,
                                        trailing: server.enabled ? "已启用" : "未启用"
                                    )
                                    .padding(.horizontal, 16)
                                    .frame(minHeight: settingsRowMinHeight, alignment: .leading)
                                }
                                .buttonStyle(HarnessPressScaleButtonStyle())
                                if index < preferences.mcpServers.count - 1 {
                                    SettingsSoftDividerView()
                                }
                            }
                        }
                    }
                }
            }
            .padding(.vertical, 8)
            }
            Button(action: onAddServer) {
                settingsPillLabel("添加服务器", style: .primary)
            }
            .buttonStyle(HarnessPressScaleButtonStyle())
            .padding(.top, 12)
            .padding(.bottom, 8)
        }
        .background(HarnessColors.canvas(colorScheme))
        .navigationTitle("MCP 服务器")
    }
}

struct PreviewMcpFormView: View {
    @Bindable var preferences: PreviewAppPreferences
    let serverId: String
    @State private var name: String = ""
    @State private var url: String = ""
    @State private var enabled: Bool = true
    @State private var testConfirm: AppConfirmRequest?
    @Environment(\.dismiss) private var dismiss
    @Environment(\.appToast) private var appToast
    @Environment(\.colorScheme) private var colorScheme

    var body: some View {
        VStack(spacing: 0) {
            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    settingsGroup(sectionLabel: "连接") {
                        VStack(alignment: .leading, spacing: 12) {
                            settingsTextField(label: "名称", text: $name, placeholder: "服务器名称")
                            settingsTextField(label: "URL / 命令", text: $url, placeholder: "stdio://…")
                            Toggle(isOn: $enabled) {
                                Text("启用").foregroundStyle(HarnessColors.secondary(colorScheme))
                            }
                            .tint(HarnessColors.primary(colorScheme))
                            .frame(minHeight: settingsRowMinHeight)
                        }
                        .padding(16)
                    }
                }
                .padding(.vertical, 8)
            }
            VStack(spacing: 10) {
                HStack(spacing: 8) {
                    Button {
                        appToast.show("连接成功")
                        testConfirm = AppConfirmRequest(
                            title: "MCP Test",
                            message: "连接成功。",
                            confirmLabel: "确定",
                            dismissLabel: ""
                        ) {}
                    } label: {
                        settingsPillLabel("Test", style: .subtle)
                    }
                    .buttonStyle(HarnessPressScaleButtonStyle())
                    if serverId != "new" {
                        Button {
                            preferences.deleteMcp(id: serverId)
                            dismiss()
                        } label: {
                            settingsPillLabel("删除", style: .subtle)
                        }
                        .buttonStyle(HarnessPressScaleButtonStyle())
                    }
                }
                Button {
                    let id = serverId == "new" ? UUID().uuidString : serverId
                    preferences.upsertMcp(PreviewMcpServer(id: id, serverName: name, url: url, enabled: enabled))
                    dismiss()
                } label: {
                    settingsPillLabel("保存", style: .primary)
                }
                .buttonStyle(HarnessPressScaleButtonStyle())
                .disabled(name.trimmingCharacters(in: .whitespaces).isEmpty || url.isEmpty)
                .opacity(name.trimmingCharacters(in: .whitespaces).isEmpty || url.isEmpty ? 0.45 : 1)
            }
            .padding(.top, 12)
            .padding(.bottom, 8)
        }
        .background(HarnessColors.canvas(colorScheme))
        .navigationTitle(serverId == "new" ? "新建 MCP" : "编辑 MCP")
        .onAppear {
            if let existing = preferences.mcpServers.first(where: { $0.id == serverId }) {
                name = existing.serverName
                url = existing.url
                enabled = existing.enabled
            }
        }
        .appConfirmDialog($testConfirm)
    }
}

private enum PreviewLoginFocusField: Hashable {
    case phone
    case code
}

struct PreviewLoginView: View {
    @Bindable var preferences: PreviewAppPreferences
    @Environment(\.dismiss) private var dismiss
    @Environment(\.appToast) private var appToast
    @State private var phone = ""
    @State private var code = ""
    @State private var codeSent = false
    @State private var keyboardOverlap: CGFloat = 0
    @State private var keyboardAnimation: Animation = .easeOut(duration: 0.25)
    @FocusState private var focusedField: PreviewLoginFocusField?

    private let fieldCornerRadius: CGFloat = 14
    private let referenceKeyboardHeight: CGFloat = 320
    private let heroCompactRatio: CGFloat = 0.62

    var body: some View {
        GeometryReader { geometry in
            let verticalInset = min(max(geometry.size.height * 0.06, 24), 40)
            let expandedHeroHeight = min(max(geometry.size.height * 0.34, 220), 252)
            let compactHeroHeight = max(expandedHeroHeight * heroCompactRatio, 140)
            let keyboardProgress = min(max(keyboardOverlap / referenceKeyboardHeight, 0), 1)
            let heroHeight = expandedHeroHeight + (compactHeroHeight - expandedHeroHeight) * keyboardProgress
            let heroToTitleGap = 24 + (12 - 24) * keyboardProgress
            let formTopGap = 32 + (20 - 32) * keyboardProgress
            let contentTopInset = verticalInset + (12 - verticalInset) * keyboardProgress
            let availableHeight = max(geometry.size.height - keyboardOverlap, 0)

            ScrollView {
                VStack(spacing: 0) {
                    loginHeroIllustration(height: heroHeight)
                    Text("Your AI Assistant\nIs Here")
                        .font(.system(size: 28, weight: .bold))
                        .multilineTextAlignment(.center)
                        .foregroundStyle(Color.black)
                        .padding(.top, heroToTitleGap)
                    Text("Always ready to help")
                        .font(.system(size: 15))
                        .foregroundStyle(Color(red: 0.60, green: 0.60, blue: 0.60))
                        .multilineTextAlignment(.center)
                        .padding(.top, 8)
                    loginPhoneField
                        .padding(.top, formTopGap)
                    if codeSent {
                        loginCodeField
                            .padding(.top, 12)
                    }
                    loginPrimaryButton
                        .padding(.top, 16)
                }
                .padding(.horizontal, 24)
                .padding(.top, contentTopInset)
                .padding(.bottom, verticalInset)
                .frame(maxWidth: .infinity)
                .frame(minHeight: availableHeight, alignment: .center)
                .animation(keyboardAnimation, value: keyboardOverlap)
            }
            .scrollDismissesKeyboard(.interactively)
        }
        .background(Color.white.ignoresSafeArea())
        .toolbar(.hidden, for: .navigationBar)
        .onReceive(NotificationCenter.default.publisher(for: UIResponder.keyboardWillChangeFrameNotification)) { notification in
            guard let frame = notification.userInfo?[UIResponder.keyboardFrameEndUserInfoKey] as? CGRect else { return }
            let duration = notification.userInfo?[UIResponder.keyboardAnimationDurationUserInfoKey] as? Double ?? 0.25
            keyboardAnimation = .easeOut(duration: duration)
            let screenHeight = UIScreen.main.bounds.height
            let overlap = max(0, screenHeight - frame.origin.y)
            withAnimation(keyboardAnimation) {
                keyboardOverlap = overlap
            }
        }
        .onReceive(NotificationCenter.default.publisher(for: UIResponder.keyboardWillHideNotification)) { notification in
            let duration = notification.userInfo?[UIResponder.keyboardAnimationDurationUserInfoKey] as? Double ?? 0.25
            keyboardAnimation = .easeOut(duration: duration)
            withAnimation(keyboardAnimation) {
                keyboardOverlap = 0
            }
        }
    }

    private var canSubmit: Bool {
        let phoneReady = phone.trimmingCharacters(in: .whitespaces).count >= 6
        let codeReady = !codeSent || code.trimmingCharacters(in: .whitespaces).count >= 4
        return phoneReady && codeReady
    }

    private var buttonLabel: String {
        codeSent ? "Log in" : "Get Verification Code"
    }

    private func loginHeroIllustration(height: CGFloat) -> some View {
        Group {
            if let uiImage = UIImage(named: "login-hero-illustration", in: .main, compatibleWith: nil) {
                Image(uiImage: uiImage)
                    .resizable()
                    .scaledToFit()
                    .frame(maxWidth: .infinity)
                    .frame(height: height)
            }
        }
    }

    private var loginPhoneField: some View {
        HStack(spacing: 10) {
            HarnessSymbol.image("iphone", size: 20)
                .foregroundStyle(Color(red: 0.67, green: 0.67, blue: 0.67))
                .padding(.trailing, 2)
            TextField("Enter your phone number", text: $phone)
                .keyboardType(.phonePad)
                .font(.system(size: 16))
                .foregroundStyle(Color(red: 0.20, green: 0.20, blue: 0.20))
                .focused($focusedField, equals: .phone)
        }
        .padding(.horizontal, 16)
        .frame(height: 52)
        .background(Color.white)
        .clipShape(RoundedRectangle(cornerRadius: fieldCornerRadius, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: fieldCornerRadius, style: .continuous)
                .stroke(Color(red: 0.90, green: 0.90, blue: 0.90), lineWidth: 1)
        )
    }

    private var loginCodeField: some View {
        TextField("Enter verification code", text: $code)
            .keyboardType(.numberPad)
            .font(.system(size: 16))
            .foregroundStyle(Color(red: 0.20, green: 0.20, blue: 0.20))
            .focused($focusedField, equals: .code)
            .padding(.horizontal, 16)
            .frame(height: 52)
            .background(Color.white)
            .clipShape(RoundedRectangle(cornerRadius: fieldCornerRadius, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: fieldCornerRadius, style: .continuous)
                    .stroke(Color(red: 0.90, green: 0.90, blue: 0.90), lineWidth: 1)
            )
    }

    private var loginPrimaryButton: some View {
        Button(action: submit) {
            Text(buttonLabel)
                .font(.system(size: 16, weight: .medium))
                .foregroundStyle(Color.white)
                .frame(maxWidth: .infinity)
                .frame(height: 52)
                .background(Color(red: 0.10, green: 0.10, blue: 0.10).opacity(canSubmit ? 1 : 0.35))
                .clipShape(RoundedRectangle(cornerRadius: fieldCornerRadius, style: .continuous))
        }
        .buttonStyle(.plain)
        .disabled(!canSubmit)
    }

    private func submit() {
        let trimmedPhone = phone.trimmingCharacters(in: .whitespaces)
        guard trimmedPhone.count >= 6 else {
            appToast.show("Please enter a valid phone number")
            return
        }
        if !codeSent {
            codeSent = true
            appToast.show("Verification code sent")
            return
        }
        guard code.trimmingCharacters(in: .whitespaces).count >= 4 else {
            appToast.show("Please enter the verification code")
            return
        }
        preferences.updateAuthProfile(PreviewAuthProfile(displayName: maskPhone(trimmedPhone), phone: trimmedPhone))
        appToast.show("Logged in")
        dismiss()
    }

    private func maskPhone(_ phone: String) -> String {
        let digits = phone.filter(\.isNumber)
        guard digits.count >= 7 else { return phone }
        return "\(digits.prefix(3))****\(digits.suffix(4))"
    }
}

struct PreviewMemoryHubView: View {
    @Bindable var preferences: PreviewAppPreferences
    @Environment(\.colorScheme) private var colorScheme

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                settingsGroup(sectionLabel: "写入") {
                    Toggle(isOn: $preferences.allowAgentMemoryWrite) {
                        Text("允许 Agent 写入记忆")
                            .foregroundStyle(HarnessColors.secondary(colorScheme))
                    }
                    .tint(HarnessColors.primary(colorScheme))
                    .padding(.horizontal, 16)
                    .frame(minHeight: settingsRowMinHeight)
                }
                settingsGroup(sectionLabel: "条目") {
                    if preferences.memoryEntries.isEmpty {
                        Text("暂无记忆")
                            .font(.caption)
                            .foregroundStyle(HarnessColors.muted(colorScheme))
                            .padding(.horizontal, 16)
                            .frame(minHeight: settingsRowMinHeight, alignment: .leading)
                    } else {
                        ForEach(Array(preferences.memoryEntries.enumerated()), id: \.element.id) { index, entry in
                            VStack(spacing: 0) {
                                HStack {
                                    Text(entry.text)
                                        .font(.body)
                                        .foregroundStyle(HarnessColors.secondary(colorScheme))
                                    Spacer()
                                    Button("删除") {
                                        preferences.deleteMemory(id: entry.id)
                                    }
                                    .font(.subheadline)
                                    .foregroundStyle(HarnessColors.link(colorScheme))
                                }
                                .padding(.horizontal, 16)
                                .frame(minHeight: settingsRowMinHeight)
                                if index < preferences.memoryEntries.count - 1 {
                                    SettingsSoftDividerView()
                                }
                            }
                        }
                    }
                }
            }
            .padding(.vertical, 8)
        }
        .background(HarnessColors.canvas(colorScheme))
        .navigationTitle("记忆")
    }
}

// MARK: - Shared settings chrome (Gate A)

let settingsRowMinHeight: CGFloat = 48

private enum SettingsPillStyle {
    case subtle
    case primary
}

private struct SettingsPillLabelView: View {
    @Environment(\.colorScheme) private var colorScheme
    let title: String
    let style: SettingsPillStyle

    var body: some View {
        Text(title)
            .font(.body)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 14)
            .foregroundStyle(
                style == .primary
                    ? HarnessColors.primaryForeground(colorScheme)
                    : HarnessColors.secondary(colorScheme)
            )
            .background(
                style == .primary
                    ? HarnessColors.primary(colorScheme)
                    : HarnessColors.subtle(colorScheme)
            )
            .clipShape(Capsule())
    }
}

@ViewBuilder
private func settingsPillLabel(_ title: String, style: SettingsPillStyle) -> some View {
    SettingsPillLabelView(title: title, style: style)
}

private func settingsPillButton(
    _ title: String,
    style: SettingsPillStyle = .primary,
    enabled: Bool = true,
    action: @escaping () -> Void
) -> some View {
    Button(action: action) {
        settingsPillLabel(title, style: style)
    }
    .buttonStyle(HarnessPressScaleButtonStyle())
    .disabled(!enabled)
    .opacity(enabled ? 1 : 0.45)
}

struct SettingsSoftDividerView: View {
    @Environment(\.colorScheme) private var colorScheme

    var body: some View {
        Divider()
            .overlay(HarnessColors.settingsDivider(colorScheme))
            .padding(.leading, 16)
    }
}

@ViewBuilder
private func settingsSoftDivider() -> some View {
    SettingsSoftDividerView()
}

private struct SettingsTextFieldView: View {
    @Environment(\.colorScheme) private var colorScheme
    let label: String
    @Binding var text: String
    var placeholder: String = ""
    var keyboard: UIKeyboardType = .default

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(label)
                .font(.caption)
                .foregroundStyle(HarnessColors.muted(colorScheme))
            TextField(placeholder, text: $text)
                .keyboardType(keyboard)
                .font(.body)
                .foregroundStyle(HarnessColors.secondary(colorScheme))
                .padding(.horizontal, 12)
                .frame(minHeight: 44)
                .background(HarnessColors.subtle(colorScheme))
                .clipShape(RoundedRectangle(cornerRadius: HarnessLayout.controlRadius, style: .continuous))
                .overlay(
                    RoundedRectangle(cornerRadius: HarnessLayout.controlRadius, style: .continuous)
                        .stroke(HarnessColors.composerBorder(colorScheme), lineWidth: 1)
                )
        }
    }
}

@ViewBuilder
private func settingsTextField(
    label: String,
    text: Binding<String>,
    placeholder: String = "",
    keyboard: UIKeyboardType = .default
) -> some View {
    SettingsTextFieldView(label: label, text: text, placeholder: placeholder, keyboard: keyboard)
}

private func apiConnectionSummary(_ raw: String) -> String {
    let trimmed = raw.trimmingCharacters(in: .whitespaces)
    if trimmed.isEmpty { return "未配置" }
    if trimmed.count > 18 { return String(trimmed.prefix(18)) + "…" }
    return trimmed
}

struct SettingsGroup<Content: View>: View {
    @Environment(\.colorScheme) private var colorScheme
    var sectionLabel: String?
    private let content: () -> Content

    init(sectionLabel: String? = nil, @ViewBuilder content: @escaping () -> Content) {
        self.sectionLabel = sectionLabel
        self.content = content
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            if let sectionLabel, !sectionLabel.isEmpty {
                Text(sectionLabel)
                    .font(.system(size: 12))
                    .foregroundStyle(HarnessColors.muted(colorScheme))
                    .padding(.leading, 4)
                    .padding(.bottom, -2)
            }
            VStack(alignment: .leading, spacing: 0) {
                content()
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(HarnessColors.surface(colorScheme))
            .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
        }
    }
}

@ViewBuilder
func settingsGroup(sectionLabel: String? = nil, @ViewBuilder content: @escaping () -> some View) -> some View {
    SettingsGroup(sectionLabel: sectionLabel, content: content)
}

@ViewBuilder
private func settingsSectionCard(_ title: String, @ViewBuilder content: @escaping () -> some View) -> some View {
    settingsGroup(sectionLabel: title) {
        content()
            .padding(16)
    }
}

@ViewBuilder
private func settingsFieldShell<Content: View>(@ViewBuilder content: () -> Content) -> some View {
    content()
        .padding(.horizontal, 4)
        .padding(.vertical, 4)
        .frame(maxWidth: .infinity, alignment: .leading)
}

struct SettingsNavRowLabelView: View {
    @Environment(\.colorScheme) private var colorScheme
    let title: String
    var trailing: String?
    var showChevron: Bool = true

    var body: some View {
        HStack(alignment: .center) {
            Text(title)
                .font(.body)
                .foregroundStyle(HarnessColors.secondary(colorScheme))
            Spacer(minLength: 8)
            if let trailing, !trailing.isEmpty {
                Text(trailing)
                    .font(.subheadline)
                    .foregroundStyle(HarnessColors.muted(colorScheme))
            }
            if showChevron {
                Image(systemName: "chevron.right")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(HarnessColors.composerPlaceholder(colorScheme))
            }
        }
    }
}

func settingsNavRowLabel(title: String, trailing: String? = nil, showChevron: Bool = true) -> some View {
    SettingsNavRowLabelView(title: title, trailing: trailing, showChevron: showChevron)
}

func settingsNavRowButton(
    title: String,
    showDividerAfter: Bool = true,
    action: @escaping () -> Void
) -> some View {
    VStack(spacing: 0) {
        Button(action: action) {
            settingsNavRowLabel(title: title, trailing: nil)
                .padding(.horizontal, 16)
                .frame(minHeight: settingsRowMinHeight)
        }
        .buttonStyle(HarnessPressScaleButtonStyle())
        if showDividerAfter {
            settingsSoftDivider()
        }
    }
}

struct PreviewReportReaderView: View {
    let title: String
    let markdown: String
    var isArtifact: Bool = false
    @Environment(\.colorScheme) private var colorScheme
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        VStack(spacing: 0) {
            HStack(spacing: 0) {
                Button(action: { dismiss() }) {
                    Text("‹")
                        .font(.system(size: 28, weight: .medium))
                        .foregroundStyle(HarnessColors.primary(colorScheme))
                        .frame(width: 40, height: 48)
                }
                .buttonStyle(.plain)
                Text(title)
                    .font(.system(size: 17))
                    .foregroundStyle(HarnessColors.secondary(colorScheme))
                    .lineLimit(1)
                    .frame(maxWidth: .infinity, alignment: .leading)
                Color.clear.frame(width: 40, height: 48)
            }
            .padding(.horizontal, 4)
            .background(HarnessColors.canvas(colorScheme))

            ScrollView {
                Group {
                    if isArtifact {
                        Text(markdown.isEmpty ? "diff preview" : markdown)
                            .font(.caption.monospaced())
                            .frame(maxWidth: .infinity, alignment: .leading)
                    } else {
                        MarkdownBodyView(markdown: markdown.isEmpty ? "# 空报告" : markdown)
                            .frame(maxWidth: .infinity, alignment: .leading)
                    }
                }
                .padding(.horizontal, 16)
                .padding(.top, 8)
                .padding(.bottom, 16)
            }
        }
        .background(HarnessColors.canvas(colorScheme))
        .toolbar(.hidden, for: .navigationBar)
    }
}
