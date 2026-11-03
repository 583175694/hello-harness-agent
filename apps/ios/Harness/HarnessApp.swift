import SwiftUI

@main
struct HarnessApp: App {
    @State private var sessionStore = PreviewSessionStore()
    @State private var preferences = PreviewAppPreferences()
    @Environment(\.scenePhase) private var scenePhase

    var body: some Scene {
        WindowGroup {
            RootNavigationView(store: sessionStore, preferences: preferences)
                .onChange(of: scenePhase) { _, phase in
                    switch phase {
                    case .background:
                        sessionStore.onAppBackground()
                    case .active:
                        sessionStore.onAppForeground()
                    default:
                        break
                    }
                }
        }
    }
}
