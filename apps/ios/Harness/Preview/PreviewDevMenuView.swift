import SwiftUI

/// Dev menu links PreviewRoute.settings via onOpenSettings (S-SET).
struct PreviewDevMenuView: View {
    @Bindable var store: PreviewSessionStore
    var onOpenSettings: () -> Void
    var onSelectFixture: (String) -> Void

    var body: some View {
        AppScaffold(title: "演示场景") {
            Text("Gate A 十场景（mobile-contract/fixtures/preview）")
                .font(.caption)
                .foregroundStyle(HarnessColors.muted)
            Button {
                onOpenSettings()
            } label: {
                VStack(alignment: .leading, spacing: 4) {
                    Text("设置")
                        .font(.body)
                        .foregroundStyle(HarnessColors.primary)
                    Text("主题 · 字号 · Reduce Motion · MCP / Memory")
                        .font(.caption)
                        .foregroundStyle(HarnessColors.muted)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.vertical, 8)
            }
            .buttonStyle(.plain)
            .accessibilityIdentifier("dev-menu-settings")
            List(store.fixtures.sorted { a, b in
                let ra = GateAPreviewFixtures.demoFixtureSortRank(a.fileName)
                let rb = GateAPreviewFixtures.demoFixtureSortRank(b.fileName)
                if ra != rb { return ra < rb }
                return a.fileName < b.fileName
            }) { fixture in
                Button {
                    store.load(fileName: fixture.fileName)
                    onSelectFixture(fixture.fileName)
                } label: {
                    VStack(alignment: .leading, spacing: 4) {
                        Text(fixture.title)
                            .font(.body)
                            .foregroundStyle(HarnessColors.primary)
                        Text(fixture.fileName)
                            .font(.caption)
                            .foregroundStyle(HarnessColors.muted)
                    }
                }
                .accessibilityIdentifier("dev-menu-fixture-\(fixture.fileName)")
            }
            .listStyle(.plain)
        }
    }
}
