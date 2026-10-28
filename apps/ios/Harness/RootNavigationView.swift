import SwiftUI

struct RootNavigationView: View {
    @Bindable var store: PreviewSessionStore
    @Bindable var preferences: PreviewAppPreferences
    @State private var path = NavigationPath()
    @State private var activeFixture = "empty-landing.json"
    @Environment(\.colorScheme) private var systemScheme

    var body: some View {
        NavigationStack(path: $path) {
            PreviewChatShellView(
                store: store,
                fixtureFileName: activeFixture,
                preferences: preferences,
                onOpenSettings: { path.append(PreviewRoute.settings) },
                onOpenReportReader: { title, markdown in
                    preferences.openReader(title: title, markdown: markdown, isArtifact: false)
                    path.append(PreviewRoute.reader)
                },
                onOpenArtifactReader: { title, diff in
                    preferences.openReader(title: title, markdown: diff, isArtifact: true)
                    path.append(PreviewRoute.reader)
                },
                onLoadDemoFixture: {
                    store.load(fileName: GateAPreviewFixtures.demoShowcase)
                    activeFixture = GateAPreviewFixtures.demoShowcase
                }
            )
            .navigationDestination(for: PreviewRoute.self) { route in
                switch route {
                case .devMenu:
                    PreviewDevMenuView(
                        store: store,
                        onOpenSettings: { path.append(PreviewRoute.settings) }
                    ) { fileName in
                        store.load(fileName: fileName)
                        activeFixture = fileName
                        if !path.isEmpty {
                            path.removeLast()
                        }
                    }
                case .settings:
                    PreviewSettingsRootView(
                        preferences: preferences,
                        onOpenPreviewScenarios: { path.append(PreviewRoute.devMenu) }
                    )
                case .reader:
                    PreviewReportReaderView(
                        title: preferences.readerTitle,
                        markdown: preferences.readerMarkdown,
                        isArtifact: preferences.readerIsArtifact
                    )
                }
            }
        }
        .preferredColorScheme(preferences.preferredColorScheme(systemScheme))
        .onAppear {
            if GateAScrollPerformanceMonitor.shouldAutoRun {
                let fileName = "long-thread-scroll.json"
                store.load(fileName: fileName)
                activeFixture = fileName
            } else {
                store.load(fileName: activeFixture)
            }
        }
    }
}

enum PreviewRoute: Hashable {
    case devMenu
    case settings
    case reader
}
