import SwiftUI

private let panelWidthRatio: CGFloat = 0.78

struct SessionDrawerOverlayView: View {
    @Bindable var store: PreviewSessionStore
    var previewReduceMotion: Bool = false
    var onOpenSettings: () -> Void = {}
    @Environment(\.accessibilityReduceMotion) private var accessibilityReduceMotion
    @State private var searchQuery: String = ""

    private var reduceMotion: Bool { previewReduceMotion || accessibilityReduceMotion }

    private func filteredSessions(_ sessions: [SessionDrawerItem]) -> [SessionDrawerItem] {
        let q = searchQuery.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !q.isEmpty else { return sessions }
        return sessions.filter { $0.title.localizedCaseInsensitiveContains(q) }
    }

    var body: some View {
        GeometryReader { geo in
            let panelWidth = geo.size.width * panelWidthRatio
            ZStack(alignment: .leading) {
                if store.drawerOpen {
                    Color.black.opacity(0.4)
                        .ignoresSafeArea()
                        .onTapGesture { store.drawerOpen = false }
                        .transition(.opacity)
                }

                if store.drawerOpen {
                    drawerPanel(width: panelWidth)
                        .frame(width: panelWidth)
                        .transition(reduceMotion ? .opacity : .move(edge: .leading))
                }
            }
            .animation(reduceMotion ? .easeOut(duration: 0.15) : .easeOut(duration: 0.28), value: store.drawerOpen)
        }
        .onChange(of: store.drawerOpen) { _, isOpen in
            if !isOpen {
                searchQuery = ""
            }
        }
        .allowsHitTesting(store.drawerOpen || store.sessionMenuTarget != nil)
        .sheet(isPresented: Binding(
            get: { store.sessionMenuTarget != nil },
            set: { if !$0 { store.sessionMenuTarget = nil } }
        )) {
            if let target = store.sessionMenuTarget {
                SessionDrawerMenuSheet(store: store, target: target)
            }
        }
    }

    @ViewBuilder
    private func drawerPanel(width: CGFloat) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Button("‹") { store.drawerOpen = false }
                Spacer()
                Text("+ 新对话").font(.caption)
                Button("设置", action: onOpenSettings)
                    .font(.caption)
            }
            .frame(height: 48)

            TextField(store.session.sessionDrawer.searchPlaceholder, text: $searchQuery)
                .textFieldStyle(.roundedBorder)

            HStack {
                Text("刷新列表").font(.caption)
                if store.drawerRefreshing {
                    ProgressView()
                } else {
                    Button("↻") { store.refreshDrawerSessions() }
                }
            }

            let filtered = filteredSessions(store.drawerSessions)
            let pinned = filtered.filter(\.pinned)
            let recent = filtered.filter { !$0.pinned }

            ScrollView {
                VStack(alignment: .leading, spacing: 6) {
                    Text(store.session.sessionDrawer.draftTitle)
                        .font(.headline)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(10)
                        .background(HarnessColors.subtle)
                        .clipShape(RoundedRectangle(cornerRadius: 12))

                    if !pinned.isEmpty {
                        Text("置顶").font(.caption).foregroundStyle(HarnessColors.muted)
                        ForEach(pinned) { row($0) }
                    }
                    Text("最近").font(.caption).foregroundStyle(HarnessColors.muted)
                    if recent.isEmpty, !searchQuery.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                        Text("无匹配会话").font(.caption).foregroundStyle(HarnessColors.muted)
                    } else {
                        ForEach(recent) { row($0) }
                    }
                }
            }
        }
        .padding(.horizontal, 12)
        .frame(maxHeight: .infinity)
        .background(HarnessColors.drawer)
    }

    @ViewBuilder
    private func row(_ item: SessionDrawerItem) -> some View {
        HStack {
            if item.running {
                Circle().fill(Color(red: 0.18, green: 0.36, blue: 0.23)).frame(width: 8, height: 8)
            }
            Text(item.title).fontWeight(item.active ? .semibold : .regular)
            Spacer()
            Text(item.time).font(.caption).foregroundStyle(HarnessColors.muted)
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
        .background(item.active ? HarnessColors.surface : Color.clear)
        .clipShape(RoundedRectangle(cornerRadius: 12))
        .onTapGesture { store.selectSession(id: item.id) }
        .onLongPressGesture { store.sessionMenuTarget = item }
    }
}

private struct SessionDrawerMenuSheet: View {
    @Bindable var store: PreviewSessionStore
    let target: SessionDrawerItem
    @State private var renameDraft: String = ""
    @State private var deleteConfirm: AppConfirmRequest?

    var body: some View {
        NavigationStack {
            Form {
                TextField("重命名", text: $renameDraft)
                Button("重命名") { store.renameSession(id: target.id, title: renameDraft) }
                Button(target.pinned ? "取消置顶" : "置顶") { store.togglePinSession(id: target.id) }
                Button("删除会话", role: .destructive) {
                    deleteConfirm = AppConfirmRequest(
                        title: "删除会话",
                        message: "确定删除「\(target.title)」？Preview 中仅从侧栏列表移除。",
                        confirmLabel: "删除",
                        destructive: true
                    ) {
                        store.deleteSession(id: target.id)
                        store.sessionMenuTarget = nil
                    }
                }
            }
            .navigationTitle(target.title)
            .onAppear { renameDraft = target.title }
            .appConfirmDialog($deleteConfirm)
        }
    }
}
