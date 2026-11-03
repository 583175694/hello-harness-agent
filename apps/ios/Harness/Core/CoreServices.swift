import Foundation

#if CORE_PORT
import HarnessMobileCore

enum CoreServices {
    private static let sessionCookieKey = "harness.session"

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
        HarnessEngineBridge(
            apiBaseUrlProvider: { preferences.apiBaseUrl },
            sessionCookieHeaderProvider: { cookieHeader() }
        )
    }
}

#endif
