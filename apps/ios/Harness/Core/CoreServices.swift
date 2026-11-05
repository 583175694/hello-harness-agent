import Foundation

#if CORE_PORT
import HarnessMobileCore

enum CoreServices {
    private static let sessionCookieKey = "harness.session"
    private(set) static var apiBaseUrl: String = ""

    static func cookieHeader() -> String? {
        guard let value = UserDefaults.standard.string(forKey: sessionCookieKey)?.trimmingCharacters(in: .whitespacesAndNewlines),
              !value.isEmpty
        else { return nil }
        return "harness_session=\(value)"
    }

    static func saveSessionCookie(_ token: String?) {
        if let token, !token.isEmpty {
            UserDefaults.standard.set(token, forKey: sessionCookieKey)
        } else {
            UserDefaults.standard.removeObject(forKey: sessionCookieKey)
        }
    }

    static func makeEngineBridge(preferences: PreviewAppPreferences) -> HarnessEngineBridge {
        apiBaseUrl = preferences.apiBaseUrl
        return HarnessEngineBridge(
            apiBaseUrlProvider: { preferences.apiBaseUrl },
            sessionCookieHeaderProvider: { cookieHeader() }
        )
    }

    static func filePreviewURL(fileId: String, preferences: PreviewAppPreferences) -> String? {
        apiBaseUrl = preferences.apiBaseUrl
        let base = preferences.apiBaseUrl
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        guard !base.isEmpty else { return nil }
        return "\(base)/api/agent/files/\(fileId)/preview"
    }
}

#endif
