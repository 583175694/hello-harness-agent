import Foundation

#if CORE_PORT

/// Release Core Settings 薄 HTTP（对齐 mobile-core HarnessMcpClient / HarnessMemoriesClient）。
enum CoreSettingsApi {
    struct MemoryHub {
        var allowWrite: Bool
        var entries: [PreviewMemoryEntry]
    }

    struct McpTestResult {
        var ok: Bool
        var message: String
    }

    static func isEnabled(preferences: PreviewAppPreferences) -> Bool {
        !normalizeBase(preferences.apiBaseUrl).isEmpty
    }

    static func loadMemoryHub(preferences: PreviewAppPreferences) async throws -> MemoryHub {
        let settings: MemorySettingsResponse = try await get(preferences, "/api/agent/memory-settings")
        let list: MemoryListResponse = try await get(preferences, "/api/agent/memories")
        let entries =
            list.memories.map { row in
                PreviewMemoryEntry(
                    id: row.memoryId,
                    text: row.summary.isEmpty ? row.title : row.summary
                )
            }
        return MemoryHub(allowWrite: settings.allowAgentWrite, entries: entries)
    }

    static func patchMemorySettings(preferences: PreviewAppPreferences, allowAgentWrite: Bool) async throws {
        let _: MemorySettingsResponse = try await patch(
            preferences,
            "/api/agent/memory-settings",
            body: ["allowAgentWrite": allowAgentWrite]
        )
    }

    static func deleteMemory(preferences: PreviewAppPreferences, memoryId: String) async throws {
        try await delete(preferences, "/api/agent/memories/\(memoryId)")
    }

    static func listMcpServers(preferences: PreviewAppPreferences) async throws -> [PreviewMcpServer] {
        let response: McpServerListResponse = try await get(preferences, "/api/agent/mcp/servers")
        return response.servers.map { server in
            PreviewMcpServer(
                id: server.id,
                serverName: server.serverName,
                url: server.url,
                enabled: server.enabled
            )
        }
    }

    static func saveMcpServer(
        preferences: PreviewAppPreferences,
        id: String?,
        serverName: String,
        url: String,
        enabled: Bool,
    ) async throws {
        let trimmedName = serverName.trimmingCharacters(in: .whitespacesAndNewlines)
        let trimmedUrl = url.trimmingCharacters(in: .whitespacesAndNewlines)
        if let id, !id.isEmpty {
            let _: McpServerResponse = try await put(
                preferences,
                "/api/agent/mcp/servers/\(id)",
                body: ["serverName": trimmedName, "url": trimmedUrl, "enabled": enabled]
            )
        } else {
            let _: McpServerResponse = try await post(
                preferences,
                "/api/agent/mcp/servers",
                body: ["serverName": trimmedName, "url": trimmedUrl, "enabled": enabled]
            )
        }
    }

    static func deleteMcpServer(preferences: PreviewAppPreferences, id: String) async throws {
        try await delete(preferences, "/api/agent/mcp/servers/\(id)")
    }

    static func testMcpServer(preferences: PreviewAppPreferences, id: String) async throws -> McpTestResult {
        let response: McpServerTestResponse = try await post(preferences, "/api/agent/mcp/servers/\(id)/test", body: nil)
        if response.ok {
            return McpTestResult(ok: true, message: "连接成功（\(response.toolNames.count) 个工具）")
        }
        return McpTestResult(ok: false, message: response.error ?? "连接失败")
    }

    // MARK: - HTTP

    private static func normalizeBase(_ url: String) -> String {
        url.trimmingCharacters(in: .whitespacesAndNewlines).trimmingCharacters(in: CharacterSet(charactersIn: "/"))
    }

    private static func baseURL(preferences: PreviewAppPreferences) throws -> URL {
        let base = normalizeBase(preferences.apiBaseUrl)
        guard let url = URL(string: base) else {
            throw URLError(.badURL)
        }
        return url
    }

    private static func get<T: Decodable>(_ preferences: PreviewAppPreferences, _ path: String) async throws -> T {
        try await request(preferences: preferences, method: "GET", path: path, body: nil)
    }

    private static func post<T: Decodable>(
        _ preferences: PreviewAppPreferences,
        _ path: String,
        body: [String: Any]?,
    ) async throws -> T {
        try await request(preferences: preferences, method: "POST", path: path, body: body)
    }

    private static func put<T: Decodable>(
        _ preferences: PreviewAppPreferences,
        _ path: String,
        body: [String: Any],
    ) async throws -> T {
        try await request(preferences: preferences, method: "PUT", path: path, body: body)
    }

    private static func patch<T: Decodable>(
        _ preferences: PreviewAppPreferences,
        _ path: String,
        body: [String: Any],
    ) async throws -> T {
        try await request(
            preferences: preferences,
            method: "PATCH",
            path: path,
            body: body,
            contentType: "application/merge-patch+json"
        )
    }

    private static func delete(_ preferences: PreviewAppPreferences, _ path: String) async throws {
        try await requestVoid(preferences: preferences, method: "DELETE", path: path)
    }

    private static func requestVoid(
        preferences: PreviewAppPreferences,
        method: String,
        path: String,
    ) async throws {
        let base = try baseURL(preferences: preferences)
        guard let url = URL(string: path, relativeTo: base) else {
            throw URLError(.badURL)
        }
        var request = URLRequest(url: url)
        request.httpMethod = method
        if let cookie = CoreServices.cookieHeader() {
            request.setValue(cookie, forHTTPHeaderField: "Cookie")
        }
        let (_, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse, (200 ..< 300).contains(http.statusCode) else {
            throw URLError(.badServerResponse)
        }
    }

    private static func request<T: Decodable>(
        preferences: PreviewAppPreferences,
        method: String,
        path: String,
        body: [String: Any]?,
        contentType: String = "application/json",
    ) async throws -> T {
        let base = try baseURL(preferences: preferences)
        guard let url = URL(string: path, relativeTo: base) else {
            throw URLError(.badURL)
        }
        var request = URLRequest(url: url)
        request.httpMethod = method
        if let cookie = CoreServices.cookieHeader() {
            request.setValue(cookie, forHTTPHeaderField: "Cookie")
        }
        if let body {
            request.setValue(contentType, forHTTPHeaderField: "Content-Type")
            request.httpBody = try JSONSerialization.data(withJSONObject: body)
        }
        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse else {
            throw URLError(.badServerResponse)
        }
        guard (200 ..< 300).contains(http.statusCode) else {
            let detail = String(data: data, encoding: .utf8) ?? "HTTP \(http.statusCode)"
            throw NSError(domain: "CoreSettingsApi", code: http.statusCode, userInfo: [NSLocalizedDescriptionKey: detail])
        }
        if data.isEmpty {
            return try JSONDecoder().decode(T.self, from: Data("{}".utf8))
        }
        return try JSONDecoder().decode(T.self, from: data)
    }

    private struct MemorySettingsResponse: Decodable {
        var allowAgentWrite: Bool
    }

    private struct MemoryListResponse: Decodable {
        var memories: [MemoryRecordResponse]
    }

    private struct MemoryRecordResponse: Decodable {
        var memoryId: String
        var title: String
        var summary: String
    }

    private struct McpServerListResponse: Decodable {
        var servers: [McpServerResponse]
    }

    private struct McpServerResponse: Decodable {
        var id: String
        var serverName: String
        var url: String
        var enabled: Bool
    }

    private struct McpServerTestResponse: Decodable {
        var ok: Bool
        var toolNames: [String]
        var error: String?
    }
}

#endif
