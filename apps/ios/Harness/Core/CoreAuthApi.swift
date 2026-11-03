import Foundation

#if CORE_PORT

enum CoreAuthApi {
    struct VerifyResult {
        var displayName: String
        var phone: String
    }

    static func isEnabled(preferences: PreviewAppPreferences) -> Bool {
        CoreSettingsApi.isEnabled(preferences: preferences)
    }

    static func sendPhoneCode(preferences: PreviewAppPreferences, phone: String) async throws {
        let _: EmptyResponse = try await post(
            preferences,
            "/api/auth/phone/send-code",
            body: ["phone": phone.trimmingCharacters(in: .whitespacesAndNewlines)]
        )
    }

    static func verifyPhone(
        preferences: PreviewAppPreferences,
        phone: String,
        code: String,
    ) async throws -> VerifyResult {
        let base = try baseURL(preferences: preferences)
        guard let url = URL(string: "/api/auth/phone/verify", relativeTo: base) else {
            throw URLError(.badURL)
        }
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        if let cookie = CoreServices.cookieHeader() {
            request.setValue(cookie, forHTTPHeaderField: "Cookie")
        }
        let body = ["phone": phone.trimmingCharacters(in: .whitespacesAndNewlines), "code": code.trimmingCharacters(in: .whitespacesAndNewlines)]
        request.httpBody = try JSONSerialization.data(withJSONObject: body)
        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse else {
            throw URLError(.badServerResponse)
        }
        guard (200 ..< 300).contains(http.statusCode) else {
            let detail = String(data: data, encoding: .utf8) ?? "HTTP \(http.statusCode)"
            throw NSError(domain: "CoreAuthApi", code: http.statusCode, userInfo: [NSLocalizedDescriptionKey: detail])
        }
        if let token = extractSessionToken(from: http) {
            CoreServices.saveSessionCookie(token)
        }
        let decoded = try JSONDecoder().decode(AuthLoginResponse.self, from: data)
        let user = decoded.user
        let display = user.displayName.trimmingCharacters(in: .whitespacesAndNewlines)
        let phoneValue = user.phone?.trimmingCharacters(in: .whitespacesAndNewlines) ?? phone
        return VerifyResult(
            displayName: display.isEmpty ? phoneValue : display,
            phone: phoneValue
        )
    }

    static func logout(preferences: PreviewAppPreferences) async {
        let base = (try? baseURL(preferences: preferences)) ?? URL(string: "http://127.0.0.1")!
        guard let url = URL(string: "/api/auth/logout", relativeTo: base) else { return }
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        if let cookie = CoreServices.cookieHeader() {
            request.setValue(cookie, forHTTPHeaderField: "Cookie")
        }
        _ = try? await URLSession.shared.data(for: request)
        CoreServices.saveSessionCookie(nil)
    }

    private static func extractSessionToken(from response: HTTPURLResponse) -> String? {
        let headerFields = response.allHeaderFields
        var cookieLines: [String] = []
        for (key, value) in headerFields {
            guard let keyString = key as? String, keyString.lowercased() == "set-cookie" else { continue }
            if let line = value as? String {
                cookieLines.append(line)
            }
        }
        let pattern = /harness_session=([^;]+)/
        for line in cookieLines {
            if let match = line.firstMatch(of: pattern) {
                return String(match.1)
            }
        }
        return nil
    }

    private static func baseURL(preferences: PreviewAppPreferences) throws -> URL {
        let raw = preferences.apiBaseUrl.trimmingCharacters(in: .whitespacesAndNewlines).trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        guard let url = URL(string: raw) else { throw URLError(.badURL) }
        return url
    }

    private static func post<T: Decodable>(
        _ preferences: PreviewAppPreferences,
        _ path: String,
        body: [String: String],
    ) async throws -> T {
        let base = try baseURL(preferences: preferences)
        guard let url = URL(string: path, relativeTo: base) else { throw URLError(.badURL) }
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        if let cookie = CoreServices.cookieHeader() {
            request.setValue(cookie, forHTTPHeaderField: "Cookie")
        }
        request.httpBody = try JSONSerialization.data(withJSONObject: body)
        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse, (200 ..< 300).contains(http.statusCode) else {
            throw URLError(.badServerResponse)
        }
        if data.isEmpty {
            return try JSONDecoder().decode(T.self, from: Data("{}".utf8))
        }
        return try JSONDecoder().decode(T.self, from: data)
    }

    private struct EmptyResponse: Decodable {}

    private struct AuthLoginResponse: Decodable {
        var user: AuthUserResponse
    }

    private struct AuthUserResponse: Decodable {
        var displayName: String
        var phone: String?
    }
}

#endif
