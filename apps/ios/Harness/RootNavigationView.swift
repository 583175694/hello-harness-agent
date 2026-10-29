import SwiftUI

struct RootNavigationView: View {
    @Bindable var store: PreviewSessionStore
    @Bindable var preferences: PreviewAppPreferences
    @State private var path = NavigationPath()
    @State private var activeFixture = "empty-landing.json"
    @Environment(\.colorScheme) private var systemScheme
    @Environment(\.accessibilityReduceMotion) private var accessibilityReduceMotion

    var body: some View {
        AppToastHost {
        NavigationStack(path: $path) {
            PreviewChatShellView(
                store: store,
                fixtureFileName: activeFixture,
                preferences: preferences,
                onOpenSettings: { path.append(PreviewRoute.settings) },
                onOpenLogin: { path.append(PreviewRoute.login) },
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
                        onOpenPreviewScenarios: { path.append(PreviewRoute.devMenu) },
                        onOpenLogin: { path.append(PreviewRoute.login) },
                        onOpenMemory: { path.append(PreviewRoute.memory) },
                        onOpenMcp: { path.append(PreviewRoute.mcpList) },
                        onOpenConnection: { path.append(PreviewRoute.connection) },
                    )
                case .memory:
                    PreviewMemoryHubView(preferences: preferences)
                case .mcpList:
                    PreviewMcpListView(
                        preferences: preferences,
                        onAddServer: { path.append(PreviewRoute.mcpForm("new")) },
                        onEditServer: { id in path.append(PreviewRoute.mcpForm(id)) },
                    )
                case .mcpForm(let serverId):
                    PreviewMcpFormView(preferences: preferences, serverId: serverId)
                case .connection:
                    PreviewConnectionSettingsView(preferences: preferences)
                case .login:
                    PreviewLoginView(preferences: preferences)
                case .reader:
                    PreviewReportReaderView(
                        title: preferences.readerTitle,
                        markdown: preferences.readerMarkdown,
                        isArtifact: preferences.readerIsArtifact
                    )
                }
            }
        }
        .transaction { transaction in
            if preferences.reduceMotion || accessibilityReduceMotion {
                transaction.disablesAnimations = true
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
}

enum PreviewRoute: Hashable {
    case devMenu
    case settings
    case login
    case reader
    case memory
    case mcpList
    case mcpForm(String)
    case connection
}
