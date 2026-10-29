import SwiftUI

/// Dev menu links PreviewRoute.settings via onOpenSettings (S-SET).
struct PreviewDevMenuView: View {
    @Bindable var store: PreviewSessionStore
    var onOpenSettings: () -> Void
    var onSelectFixture: (String) -> Void
    @Environment(\.colorScheme) private var colorScheme

    private var sortedFixtures: [PreviewFixtureDescriptor] {
        store.fixtures.sorted { a, b in
            let ra = GateAPreviewFixtures.demoFixtureSortRank(a.fileName)
            let rb = GateAPreviewFixtures.demoFixtureSortRank(b.fileName)
            if ra != rb { return ra < rb }
            return a.fileName < b.fileName
        }
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: HarnessLayout.settingsGroupGap) {
                settingsGroup(sectionLabel: "快捷") {
                    Button(action: onOpenSettings) {
                        settingsNavRowLabel(title: "设置", trailing: nil)
                            .padding(.horizontal, 16)
                            .frame(minHeight: settingsRowMinHeight, alignment: .leading)
                    }
                    .buttonStyle(.plain)
                    .accessibilityIdentifier("dev-menu-settings")
                }

                settingsGroup(sectionLabel: "场景") {
                    ForEach(Array(sortedFixtures.enumerated()), id: \.element.fileName) { index, fixture in
                        VStack(spacing: 0) {
                            Button {
                                store.load(fileName: fixture.fileName)
                                onSelectFixture(fixture.fileName)
                            } label: {
                                settingsNavRowLabel(title: fixture.title, trailing: nil)
                                    .padding(.horizontal, 16)
                                    .frame(minHeight: settingsRowMinHeight, alignment: .leading)
                            }
                            .buttonStyle(.plain)
                            .accessibilityIdentifier("dev-menu-fixture-\(fixture.fileName)")
                            if index < sortedFixtures.count - 1 {
                                SettingsSoftDividerView()
                            }
                        }
                    }
                }
            }
            .padding(.vertical, 8)
        }
        .background(HarnessColors.canvas(colorScheme))
        .navigationTitle("演示场景")
        .navigationBarTitleDisplayMode(.inline)
    }
}
