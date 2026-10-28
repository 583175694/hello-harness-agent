import SwiftUI

struct PreviewSettingsRootView: View {
    @Bindable var preferences: PreviewAppPreferences
    var onOpenPreviewScenarios: () -> Void = {}

    var body: some View {
        AppScaffold(title: "设置") {
            ScrollView {
                VStack(alignment: .leading, spacing: 12) {
                    settingsSection("通用") {
                        Text("主题").font(.caption).foregroundStyle(HarnessColors.muted)
                        HStack(spacing: 8) {
                            themeChip("跟随系统", selected: preferences.themeMode == .system) { preferences.themeMode = .system }
                            themeChip("浅色", selected: preferences.themeMode == .light) { preferences.themeMode = .light }
                            themeChip("深色", selected: preferences.themeMode == .dark) { preferences.themeMode = .dark }
                        }
                        Divider().overlay(HarnessColors.composerBorder)
                        HStack {
                            Text("正文字号")
                            Spacer()
                            settingsStepperButton("−") { preferences.contentFontSize = max(13, preferences.contentFontSize - 1) }
                            Text("\(preferences.contentFontSize)px").font(.body)
                            settingsStepperButton("+") { preferences.contentFontSize = min(20, preferences.contentFontSize + 1) }
                        }
                        Divider().overlay(HarnessColors.composerBorder)
                        Toggle("Reduce Motion", isOn: $preferences.reduceMotion)
                        Text("Drawer / Workbench 减少滑动动画（Preview 假保存）")
                            .font(.caption)
                            .foregroundStyle(HarnessColors.muted)
                    }

                    settingsSection("Agent") {
                        settingsNavLink(title: "记忆", subtitle: "本地假数据 · UI+Local") {
                            PreviewMemoryHubView(preferences: preferences)
                        }
                        settingsNavLink(title: "MCP 服务器", subtitle: "CRUD + Test 模拟") {
                            PreviewMcpListView(preferences: preferences)
                        }
                        Button {
                            onOpenPreviewScenarios()
                        } label: {
                            settingsNavRowLabel(title: "演示场景", subtitle: "切换 Gate A fixture（开发用）")
                        }
                        .buttonStyle(.plain)
                    }

                    settingsSection("连接") {
                        Text("API Base URL（仅编辑器 UI）").font(.caption).foregroundStyle(HarnessColors.muted)
                        TextField("http://192.168.x.x:4318", text: $preferences.apiBaseUrl)
                            .textFieldStyle(.roundedBorder)
                            .padding(10)
                            .background(HarnessColors.canvas)
                            .clipShape(RoundedRectangle(cornerRadius: HarnessLayout.controlRadius, style: .continuous))
                            .overlay(
                                RoundedRectangle(cornerRadius: HarnessLayout.controlRadius, style: .continuous)
                                    .stroke(HarnessColors.composerBorder, lineWidth: 1)
                            )
                        Text("当前生效：\(preferences.apiBaseUrl.trimmingCharacters(in: .whitespaces).isEmpty ? "（未填 — Phase B 联调后生效）" : preferences.apiBaseUrl)")
                            .font(.caption)
                            .foregroundStyle(HarnessColors.muted)
                    }

                    Text("Phase A：本地 KV 假保存，无 Harness HTTP。")
                        .font(.caption)
                        .foregroundStyle(HarnessColors.muted)
                        .padding(12)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(HarnessColors.subtle)
                        .clipShape(RoundedRectangle(cornerRadius: HarnessLayout.panelRadius, style: .continuous))
                        .overlay(
                            RoundedRectangle(cornerRadius: HarnessLayout.panelRadius, style: .continuous)
                                .stroke(HarnessColors.composerBorder, lineWidth: 1)
                        )
                }
                .padding(.vertical, 4)
            }
        }
    }

    @ViewBuilder
    private func settingsSection(_ title: String, @ViewBuilder content: () -> some View) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(title).font(.headline)
            content()
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(HarnessColors.surface)
        .clipShape(RoundedRectangle(cornerRadius: HarnessLayout.panelRadius, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: HarnessLayout.panelRadius, style: .continuous)
                .stroke(HarnessColors.composerBorder, lineWidth: 1)
        )
    }

    private func settingsStepperButton(_ label: String, action: @escaping () -> Void) -> some View {
        Button(label, action: action)
            .font(.body.weight(.semibold))
            .frame(width: 32, height: 32)
            .background(HarnessColors.surface)
            .clipShape(RoundedRectangle(cornerRadius: HarnessLayout.controlRadius, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: HarnessLayout.controlRadius, style: .continuous)
                    .stroke(HarnessColors.composerBorder, lineWidth: 1)
            )
    }

    private func themeChip(_ label: String, selected: Bool, action: @escaping () -> Void) -> some View {
        Button(label, action: action)
            .font(.caption)
            .padding(.horizontal, 12)
            .padding(.vertical, 6)
            .background(selected ? HarnessColors.subtle : HarnessColors.surface)
            .clipShape(Capsule())
            .overlay(
                Capsule()
                    .stroke(selected ? HarnessColors.primary : HarnessColors.composerBorder, lineWidth: 1)
            )
    }
}

struct PreviewMcpListView: View {
    @Bindable var preferences: PreviewAppPreferences

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 12) {
                Text("列表与表单为静态 UI；Test 按钮弹出本地 Alert。")
                    .font(.caption)
                    .foregroundStyle(HarnessColors.muted)
                settingsSectionCard("已配置") {
                    if preferences.mcpServers.isEmpty {
                        Text("暂无服务器").font(.caption).foregroundStyle(HarnessColors.muted)
                    } else {
                        ForEach(Array(preferences.mcpServers.enumerated()), id: \.element.id) { index, server in
                            NavigationLink {
                                PreviewMcpFormView(preferences: preferences, serverId: server.id)
                            } label: {
                                settingsNavRowLabel(
                                    title: server.serverName,
                                    subtitle: server.url,
                                    trailing: server.enabled ? "已启用" : "未启用"
                                )
                            }
                            .buttonStyle(.plain)
                            if index < preferences.mcpServers.count - 1 {
                                Divider().overlay(HarnessColors.composerBorder)
                            }
                        }
                    }
                }
                NavigationLink {
                    PreviewMcpFormView(preferences: preferences, serverId: "new")
                } label: {
                    Text("添加服务器")
                        .font(.body.weight(.medium))
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 12)
                        .background(HarnessColors.primary)
                        .foregroundStyle(HarnessColors.primaryForeground)
                        .clipShape(RoundedRectangle(cornerRadius: HarnessLayout.controlRadius, style: .continuous))
                }
                .buttonStyle(.plain)
            }
            .padding(.vertical, 4)
        }
        .background(HarnessColors.canvas)
        .navigationTitle("MCP 服务器")
    }
}

struct PreviewMcpFormView: View {
    @Bindable var preferences: PreviewAppPreferences
    let serverId: String
    @State private var name: String = ""
    @State private var url: String = ""
    @State private var enabled: Bool = true
    @State private var showTestAlert = false
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 12) {
                settingsSectionCard("连接") {
                    settingsFieldShell {
                        TextField("名称", text: $name)
                    }
                    settingsFieldShell {
                        TextField("URL / 命令", text: $url)
                    }
                    .padding(.top, 8)
                    Toggle("启用", isOn: $enabled)
                        .padding(.top, 8)
                }
                HStack(spacing: 8) {
                    Button("Test") { showTestAlert = true }
                        .buttonStyle(.bordered)
                    if serverId != "new" {
                        Button("删除", role: .destructive) {
                            preferences.deleteMcp(id: serverId)
                            dismiss()
                        }
                    }
                }
                Button("保存") {
                    let id = serverId == "new" ? UUID().uuidString : serverId
                    preferences.upsertMcp(PreviewMcpServer(id: id, serverName: name, url: url, enabled: enabled))
                    dismiss()
                }
                .frame(maxWidth: .infinity)
                .padding(.vertical, 12)
                .background(HarnessColors.primary)
                .foregroundStyle(HarnessColors.primaryForeground)
                .clipShape(RoundedRectangle(cornerRadius: HarnessLayout.controlRadius, style: .continuous))
                .disabled(name.trimmingCharacters(in: .whitespaces).isEmpty || url.isEmpty)
                Text("Test 与保存均为 Preview 本地模拟。")
                    .font(.caption)
                    .foregroundStyle(HarnessColors.muted)
                    .padding(12)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(HarnessColors.subtle)
                    .clipShape(RoundedRectangle(cornerRadius: HarnessLayout.panelRadius, style: .continuous))
                    .overlay(
                        RoundedRectangle(cornerRadius: HarnessLayout.panelRadius, style: .continuous)
                            .stroke(HarnessColors.composerBorder, lineWidth: 1)
                    )
            }
            .padding(.vertical, 4)
        }
        .background(HarnessColors.canvas)
        .navigationTitle(serverId == "new" ? "新建 MCP" : "编辑 MCP")
        .onAppear {
            if let existing = preferences.mcpServers.first(where: { $0.id == serverId }) {
                name = existing.serverName
                url = existing.url
                enabled = existing.enabled
            }
        }
        .alert("MCP Test（Preview）", isPresented: $showTestAlert) {
            Button("确定", role: .cancel) {}
        } message: {
            Text("连接成功（本地模拟）。")
        }
    }
}

struct PreviewMemoryHubView: View {
    @Bindable var preferences: PreviewAppPreferences
    @State private var draft = ""

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 12) {
                settingsSectionCard("写入") {
                    Toggle("允许 Agent 写入记忆", isOn: $preferences.allowAgentMemoryWrite)
                    Text("本地开关 · 不调用 API")
                        .font(.caption)
                        .foregroundStyle(HarnessColors.muted)
                }
                settingsSectionCard("新增") {
                    settingsFieldShell {
                        TextField("记忆条目", text: $draft)
                    }
                    Button("添加") {
                        preferences.addMemory(draft)
                        draft = ""
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 12)
                    .background(HarnessColors.primary)
                    .foregroundStyle(HarnessColors.primaryForeground)
                    .clipShape(RoundedRectangle(cornerRadius: HarnessLayout.controlRadius, style: .continuous))
                    .disabled(draft.trimmingCharacters(in: .whitespaces).isEmpty)
                    .padding(.top, 8)
                }
                settingsSectionCard("条目") {
                    if preferences.memoryEntries.isEmpty {
                        Text("暂无记忆").font(.caption).foregroundStyle(HarnessColors.muted)
                    } else {
                        ForEach(Array(preferences.memoryEntries.enumerated()), id: \.element.id) { index, entry in
                            HStack(alignment: .top) {
                                Text(entry.text)
                                    .font(.body)
                                Spacer(minLength: 8)
                                Button("删除", role: .destructive) {
                                    preferences.deleteMemory(id: entry.id)
                                }
                            }
                            .padding(.vertical, 8)
                            if index < preferences.memoryEntries.count - 1 {
                                Divider().overlay(HarnessColors.composerBorder)
                            }
                        }
                    }
                }
            }
            .padding(.vertical, 4)
        }
        .background(HarnessColors.canvas)
        .navigationTitle("记忆")
    }
}

// MARK: - Shared settings chrome (Gate A)

@ViewBuilder
private func settingsSectionCard(_ title: String, @ViewBuilder content: () -> some View) -> some View {
    VStack(alignment: .leading, spacing: 12) {
        Text(title).font(.headline)
        content()
    }
    .padding(16)
    .frame(maxWidth: .infinity, alignment: .leading)
    .background(HarnessColors.surface)
    .clipShape(RoundedRectangle(cornerRadius: HarnessLayout.panelRadius, style: .continuous))
    .overlay(
        RoundedRectangle(cornerRadius: HarnessLayout.panelRadius, style: .continuous)
            .stroke(HarnessColors.composerBorder, lineWidth: 1)
    )
}

@ViewBuilder
private func settingsFieldShell<Content: View>(@ViewBuilder content: () -> Content) -> some View {
    content()
        .padding(10)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(HarnessColors.canvas)
        .clipShape(RoundedRectangle(cornerRadius: HarnessLayout.controlRadius, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: HarnessLayout.controlRadius, style: .continuous)
                .stroke(HarnessColors.composerBorder, lineWidth: 1)
        )
}

private func settingsNavRowLabel(title: String, subtitle: String, trailing: String? = nil) -> some View {
    HStack(alignment: .center) {
        VStack(alignment: .leading, spacing: 4) {
            Text(title).font(.body)
            if !subtitle.isEmpty {
                Text(subtitle).font(.caption).foregroundStyle(HarnessColors.muted)
            }
        }
        Spacer(minLength: 8)
        if let trailing {
            Text(trailing).font(.caption2).foregroundStyle(HarnessColors.secondary)
        }
        Image(systemName: "chevron.right")
            .font(.caption.weight(.semibold))
            .foregroundStyle(HarnessColors.muted)
    }
    .padding(.vertical, 8)
}

private func settingsNavLink<Destination: View>(
    title: String,
    subtitle: String,
    @ViewBuilder destination: () -> Destination
) -> some View {
    VStack(spacing: 0) {
        NavigationLink {
            destination()
        } label: {
            settingsNavRowLabel(title: title, subtitle: subtitle)
        }
        .buttonStyle(.plain)
        Divider().overlay(HarnessColors.composerBorder)
    }
}

struct PreviewReportReaderView: View {
    let title: String
    let markdown: String
    var isArtifact: Bool = false

    var body: some View {
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
            .padding(16)
            .background(HarnessColors.surface)
            .clipShape(RoundedRectangle(cornerRadius: HarnessLayout.panelRadius, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: HarnessLayout.panelRadius, style: .continuous)
                    .stroke(HarnessColors.composerBorder, lineWidth: 1)
            )
            .padding(16)
        }
        .background(HarnessColors.canvas)
        .navigationTitle(title)
        .navigationBarTitleDisplayMode(.inline)
        .toolbarBackground(HarnessColors.canvas, for: .navigationBar)
        .toolbarBackground(.visible, for: .navigationBar)
    }
}
