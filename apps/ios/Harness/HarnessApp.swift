import SwiftUI

@main
struct HarnessApp: App {
    @State private var sessionStore = PreviewSessionStore()
    @State private var preferences = PreviewAppPreferences()

    var body: some Scene {
        WindowGroup {
            RootNavigationView(store: sessionStore, preferences: preferences)
        }
    }
}
