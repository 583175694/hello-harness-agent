import Foundation
import SwiftUI

enum PreviewThemeMode: String, CaseIterable {
    case system
    case light
    case dark
}

struct PreviewMcpServer: Identifiable, Equatable {
    let id: String
    var serverName: String
    var url: String
    var enabled: Bool
}

struct PreviewMemoryEntry: Identifiable, Equatable {
    let id: String
    var text: String
}

struct PreviewAuthProfile: Equatable {
    var displayName: String
    var phone: String
}

enum PreviewComposerBlockKind: String, CaseIterable {
    case none
    case loginRequired
    case transcriptIncompatible
}

@Observable
final class PreviewAppPreferences {
    var themeMode: PreviewThemeMode {
        didSet { defaults.set(themeMode.rawValue, forKey: Keys.theme) }
    }
    var contentFontSize: Int {
        didSet { defaults.set(contentFontSize, forKey: Keys.fontSize) }
    }
    var apiBaseUrl: String {
        didSet { defaults.set(apiBaseUrl, forKey: Keys.apiUrl) }
    }
    var allowAgentMemoryWrite: Bool {
        didSet { defaults.set(allowAgentMemoryWrite, forKey: Keys.memoryWrite) }
    }
    var reduceMotion: Bool {
        didSet { defaults.set(reduceMotion, forKey: Keys.reduceMotion) }
    }
    var readerTitle: String = "Report"
    var readerMarkdown: String = ""
    var readerIsArtifact: Bool = false

    var authProfile: PreviewAuthProfile? {
        didSet { persistAuth() }
    }

    var composerBlockDemo: PreviewComposerBlockKind {
        didSet { defaults.set(composerBlockDemo.rawValue, forKey: Keys.composerBlockDemo) }
    }

    var isLoggedIn: Bool { authProfile != nil }

    var mcpServers: [PreviewMcpServer]
    var memoryEntries: [PreviewMemoryEntry]

    private let defaults = UserDefaults.standard

    init() {
        let themeRaw = defaults.string(forKey: Keys.theme) ?? PreviewThemeMode.system.rawValue
        themeMode = PreviewThemeMode(rawValue: themeRaw) ?? .system
        let font = defaults.integer(forKey: Keys.fontSize)
        contentFontSize = font == 0 ? 15 : min(max(font, 13), 20)
        apiBaseUrl = defaults.string(forKey: Keys.apiUrl) ?? ""
        allowAgentMemoryWrite = defaults.object(forKey: Keys.memoryWrite) as? Bool ?? true
        reduceMotion = defaults.object(forKey: Keys.reduceMotion) as? Bool ?? false
        authProfile = Self.loadAuth(from: defaults)
        let blockRaw = defaults.string(forKey: Keys.composerBlockDemo) ?? PreviewComposerBlockKind.none.rawValue
        composerBlockDemo = PreviewComposerBlockKind(rawValue: blockRaw) ?? .none
        mcpServers = Self.loadMcp(from: defaults) ?? Self.defaultMcp
        memoryEntries = Self.loadMemory(from: defaults) ?? Self.defaultMemory
    }

    func resolveComposerBlock() -> PreviewComposerBlockKind {
        if composerBlockDemo != .none { return composerBlockDemo }
        if !apiBaseUrl.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty, !isLoggedIn {
            return .loginRequired
        }
        return .none
    }

    func updateAuthProfile(_ profile: PreviewAuthProfile?) {
        authProfile = profile
    }

    func preferredColorScheme(_ system: ColorScheme) -> ColorScheme? {
        switch themeMode {
        case .light: return .light
        case .dark: return .dark
        case .system: return nil
        }
    }

    func openReader(title: String, markdown: String, isArtifact: Bool = false) {
        readerTitle = title
        readerMarkdown = markdown
        readerIsArtifact = isArtifact
    }

    func upsertMcp(_ server: PreviewMcpServer) {
        if let idx = mcpServers.firstIndex(where: { $0.id == server.id }) {
            mcpServers[idx] = server
        } else {
            mcpServers.append(server)
        }
        persistMcp()
    }

    func deleteMcp(id: String) {
        mcpServers.removeAll { $0.id == id }
        persistMcp()
    }

    func addMemory(_ text: String) {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }
        memoryEntries.insert(PreviewMemoryEntry(id: UUID().uuidString, text: trimmed), at: 0)
        persistMemory()
    }

    func deleteMemory(id: String) {
        memoryEntries.removeAll { $0.id == id }
        persistMemory()
    }

    private func persistMcp() {
        let payload = mcpServers.map { ["id": $0.id, "serverName": $0.serverName, "url": $0.url, "enabled": $0.enabled] as [String: Any] }
        defaults.set(payload, forKey: Keys.mcp)
    }

    private func persistMemory() {
        let payload = memoryEntries.map { ["id": $0.id, "text": $0.text] }
        defaults.set(payload, forKey: Keys.memory)
    }

    private static func loadMcp(from defaults: UserDefaults) -> [PreviewMcpServer]? {
        guard let rows = defaults.array(forKey: Keys.mcp) as? [[String: Any]] else { return nil }
        return rows.compactMap { row in
            guard let id = row["id"] as? String,
                  let name = row["serverName"] as? String,
                  let url = row["url"] as? String else { return nil }
            return PreviewMcpServer(id: id, serverName: name, url: url, enabled: row["enabled"] as? Bool ?? true)
        }
    }

    private static func loadMemory(from defaults: UserDefaults) -> [PreviewMemoryEntry]? {
        guard let rows = defaults.array(forKey: Keys.memory) as? [[String: Any]] else { return nil }
        return rows.compactMap { row in
            guard let id = row["id"] as? String, let text = row["text"] as? String else { return nil }
            return PreviewMemoryEntry(id: id, text: text)
        }
    }

    private func persistAuth() {
        if let profile = authProfile {
            defaults.set(profile.phone, forKey: Keys.authPhone)
            defaults.set(profile.displayName, forKey: Keys.authName)
        } else {
            defaults.removeObject(forKey: Keys.authPhone)
            defaults.removeObject(forKey: Keys.authName)
        }
    }

    private static func loadAuth(from defaults: UserDefaults) -> PreviewAuthProfile? {
        let phone = (defaults.string(forKey: Keys.authPhone) ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        guard !phone.isEmpty else { return nil }
        let name = (defaults.string(forKey: Keys.authName) ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        return PreviewAuthProfile(displayName: name.isEmpty ? phone : name, phone: phone)
    }

    private enum Keys {
        static let theme = "preview.themeMode"
        static let fontSize = "preview.contentFontSize"
        static let apiUrl = "preview.apiBaseUrl"
        static let memoryWrite = "preview.allowAgentMemoryWrite"
        static let reduceMotion = "preview.reduceMotion"
        static let mcp = "preview.mcpServers"
        static let memory = "preview.memoryEntries"
        static let authPhone = "preview.authPhone"
        static let authName = "preview.authDisplayName"
        static let composerBlockDemo = "preview.composerBlockDemo"
    }

    private static let defaultMcp: [PreviewMcpServer] = [
        PreviewMcpServer(id: "local-files", serverName: "本地文件（Preview）", url: "stdio://preview-files", enabled: true),
        PreviewMcpServer(id: "local-search", serverName: "检索（Preview）", url: "https://example.com/mcp", enabled: false),
    ]

    private static let defaultMemory: [PreviewMemoryEntry] = [
        PreviewMemoryEntry(id: "mem-1", text: "用户偏好：简洁回答"),
        PreviewMemoryEntry(id: "mem-2", text: "常用项目：hello-harness-agent"),
    ]
}
