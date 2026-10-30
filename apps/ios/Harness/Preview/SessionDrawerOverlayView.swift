import SwiftUI

private let panelWidthRatio: CGFloat = 0.78

struct SessionDrawerOverlayView: View {
    @Bindable var store: PreviewSessionStore
    var previewReduceMotion: Bool = false
    var onOpenSettings: () -> Void = {}
    @Environment(\.accessibilityReduceMotion) private var accessibilityReduceMotion
    @Environment(\.colorScheme) private var colorScheme

    private var reduceMotion: Bool { previewReduceMotion || accessibilityReduceMotion }

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
        .allowsHitTesting(store.drawerOpen || store.sessionMenuTarget != nil)
        .overlay {
            if let target = store.sessionMenuTarget {
                SessionDrawerContextMenuOverlay(store: store, target: target)
            }
        }
    }

    @ViewBuilder
    private func drawerPanel(width: CGFloat) -> some View {
        VStack(spacing: 0) {
            VStack(alignment: .leading, spacing: 0) {
                Button {
                    store.startNewConversation(draftTitle: store.session.sessionDrawer.draftTitle)
                } label: {
                    HStack(spacing: 10) {
                        Image(systemName: "plus")
                            .font(.system(size: 18, weight: .semibold))
                            .foregroundStyle(HarnessColors.primary(colorScheme))
                        Text("新对话")
                            .font(.system(size: 15, weight: .semibold))
                            .foregroundStyle(HarnessColors.primary(colorScheme))
                        Spacer(minLength: 0)
                    }
                    .frame(maxWidth: .infinity, minHeight: 48, alignment: .leading)
                    .padding(.leading, 10)
                    .padding(.trailing, 12)
                    .background(HarnessColors.subtle(colorScheme))
                    .clipShape(RoundedRectangle(cornerRadius: HarnessLayout.controlRadius, style: .continuous))
                    .overlay(
                        RoundedRectangle(cornerRadius: HarnessLayout.controlRadius, style: .continuous)
                            .stroke(HarnessColors.composerBorder(colorScheme), lineWidth: 1)
                    )
                    .opacity(store.isInDraftMode ? 0.45 : 1)
                }
                .buttonStyle(HarnessPressScaleButtonStyle())
                .disabled(store.isInDraftMode)
                .accessibilityLabel("新建对话")
                .accessibilityAddTraits(store.isInDraftMode ? .isStaticText : [])
                .padding(.bottom, 12)

                let sessions = store.drawerSessions
                let pinned = sessions.filter(\.pinned)
                let recent = sessions.filter { !$0.pinned }

                ScrollView {
                    VStack(alignment: .leading, spacing: 2) {
                        if !pinned.isEmpty {
                            sectionLabel("置顶")
                            ForEach(pinned) { row($0) }
                        }
                        sectionLabel("最近")
                        ForEach(recent) { row($0) }
                    }
                }
                .refreshable {
                    store.refreshDrawerSessions()
                    try? await Task.sleep(nanoseconds: 650_000_000)
                }
            }
            .padding(.horizontal, 16)
            .padding(.top, 12)
            .frame(maxHeight: .infinity, alignment: .top)

            Button(action: onOpenSettings) {
                HStack(spacing: 10) {
                    Image(systemName: "gearshape")
                        .font(.system(size: 18))
                        .foregroundStyle(HarnessColors.secondary(colorScheme))
                    Text("设置")
                        .font(.system(size: 14, weight: .medium))
                        .foregroundStyle(HarnessColors.primary(colorScheme))
                    Spacer(minLength: 0)
                }
                .frame(minHeight: 48, alignment: .leading)
                .padding(.horizontal, 20)
            }
            .buttonStyle(.plain)
            .padding(.bottom, 12)
        }
        .frame(maxHeight: .infinity)
        .background(HarnessColors.drawer(colorScheme))
    }

    private func sectionLabel(_ text: String) -> some View {
        Text(text)
            .font(.system(size: 12))
            .foregroundStyle(HarnessColors.muted(colorScheme))
            .padding(.horizontal, 4)
            .padding(.top, 6)
            .padding(.bottom, 2)
    }

    @ViewBuilder
    private func row(_ item: SessionDrawerItem) -> some View {
        HStack(spacing: 8) {
            if item.running {
                Circle()
                    .fill(Color(red: 0.18, green: 0.36, blue: 0.23))
                    .frame(width: 8, height: 8)
            }
            Text(item.title)
                .font(.system(size: 14, weight: item.active ? .semibold : .medium))
                .foregroundStyle(HarnessColors.primary(colorScheme))
                .lineLimit(1)
                .frame(maxWidth: .infinity, alignment: .leading)
            if !item.time.isEmpty {
                Text(item.time)
                    .font(.system(size: 12))
                    .foregroundStyle(HarnessColors.muted(colorScheme))
            }
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 10)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            store.sessionMenuTarget?.id == item.id
                ? HarnessColors.surface(colorScheme)
                : (item.active ? HarnessColors.subtle(colorScheme) : Color.clear)
        )
        .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
        .shadow(color: store.sessionMenuTarget?.id == item.id ? Color.black.opacity(0.08) : .clear, radius: 6, y: 2)
        .contentShape(Rectangle())
        .onTapGesture { store.selectSession(id: item.id) }
        .onLongPressGesture { store.sessionMenuTarget = item }
    }
}

private struct SessionDrawerContextMenuOverlay: View {
    @Bindable var store: PreviewSessionStore
    let target: SessionDrawerItem
    @Environment(\.colorScheme) private var colorScheme
    @State private var renameDraft: String = ""
    @State private var renameOpen = false
    @State private var deleteConfirm: AppConfirmRequest?
    @State private var menuMotionScale: CGFloat = 0.82
    @State private var menuMotionOpacity: Double = 0
    @State private var menuMotionOffsetY: CGFloat = -12

    var body: some View {
        ZStack(alignment: .topLeading) {
            Color.clear
                .contentShape(Rectangle())
                .ignoresSafeArea()
                .onTapGesture { store.sessionMenuTarget = nil }

            if !renameOpen {
                VStack(alignment: .leading, spacing: 0) {
                    contextRow("pencil", "重命名") {
                        renameDraft = target.title
                        withAnimation(.easeOut(duration: 0.22)) {
                            renameOpen = true
                        }
                    }
                    contextRow("pin", target.pinned ? "取消置顶" : "置顶") {
                        store.togglePinSession(id: target.id)
                        store.sessionMenuTarget = nil
                    }
                    Divider().padding(.horizontal, 12)
                    contextRow("trash", "删除", destructive: true) {
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
                .frame(width: 200, alignment: .leading)
                .padding(.vertical, 4)
                .background(HarnessColors.surface(colorScheme))
                .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
                .overlay(
                    RoundedRectangle(cornerRadius: 16, style: .continuous)
                        .stroke(HarnessColors.composerBorder(colorScheme), lineWidth: 1)
                )
                .padding(.leading, 16)
                .padding(.top, 120)
                .scaleEffect(menuMotionScale, anchor: .topLeading)
                .opacity(menuMotionOpacity)
                .offset(y: menuMotionOffsetY)
            }

            if renameOpen {
                SessionRenameOverlay(
                    draft: $renameDraft,
                    onCancel: {
                        withAnimation(.easeOut(duration: 0.2)) {
                            renameOpen = false
                            store.sessionMenuTarget = nil
                        }
                    },
                    onSave: {
                        store.renameSession(id: target.id, title: renameDraft)
                        renameOpen = false
                        store.sessionMenuTarget = nil
                    }
                )
            }
        }
        .onAppear {
            playMenuOpenAnimation()
        }
        .onChange(of: target.id) { _, _ in
            playMenuOpenAnimation()
        }
        .appConfirmDialog($deleteConfirm)
    }

    private func playMenuOpenAnimation() {
        menuMotionScale = 0.82
        menuMotionOpacity = 0
        menuMotionOffsetY = -12
        withAnimation(.spring(response: 0.34, dampingFraction: 0.78)) {
            menuMotionScale = 1
            menuMotionOpacity = 1
            menuMotionOffsetY = 0
        }
    }

    @ViewBuilder
    private func contextRow(
        _ symbol: String,
        _ title: String,
        destructive: Bool = false,
        action: @escaping () -> Void
    ) -> some View {
        Button(action: action) {
            HStack(spacing: 12) {
                Image(systemName: symbol)
                    .font(.system(size: 16, weight: .medium))
                    .frame(width: 18)
                Text(title)
                    .font(.system(size: 14, weight: .medium))
                Spacer(minLength: 0)
            }
            .foregroundStyle(destructive ? HarnessColors.danger : HarnessColors.primary(colorScheme))
            .padding(.horizontal, 16)
            .padding(.vertical, 10)
        }
        .buttonStyle(.plain)
    }
}

private struct SessionRenameOverlay: View {
    @Binding var draft: String
    var onCancel: () -> Void
    var onSave: () -> Void
    @Environment(\.colorScheme) private var colorScheme
    @State private var presented = false

    var body: some View {
        ZStack {
            Color.black.opacity(0.25)
                .ignoresSafeArea()
                .opacity(presented ? 1 : 0)
                .onTapGesture(perform: onCancel)

            VStack(alignment: .leading, spacing: 12) {
                Text("重命名会话")
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(HarnessColors.secondary(colorScheme))
                VStack(alignment: .leading, spacing: 6) {
                    Text("会话标题")
                        .font(.caption)
                        .foregroundStyle(HarnessColors.muted(colorScheme))
                    TextField("输入标题", text: $draft)
                        .font(.body)
                        .foregroundStyle(HarnessColors.secondary(colorScheme))
                        .padding(.horizontal, 12)
                        .frame(minHeight: 44)
                        .background(HarnessColors.subtle(colorScheme))
                        .clipShape(RoundedRectangle(cornerRadius: HarnessLayout.controlRadius, style: .continuous))
                        .overlay(
                            RoundedRectangle(cornerRadius: HarnessLayout.controlRadius, style: .continuous)
                                .stroke(HarnessColors.composerBorder(colorScheme), lineWidth: 1)
                        )
                }
                HStack(spacing: 12) {
                    Button(action: onCancel) {
                        Text("取消")
                            .font(.body)
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 12)
                            .foregroundStyle(HarnessColors.secondary(colorScheme))
                            .background(HarnessColors.subtle(colorScheme))
                            .clipShape(RoundedRectangle(cornerRadius: HarnessLayout.controlRadius, style: .continuous))
                    }
                    .buttonStyle(HarnessPressScaleButtonStyle())

                    Button(action: onSave) {
                        Text("保存")
                            .font(.body.weight(.semibold))
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 12)
                            .foregroundStyle(HarnessColors.primaryForeground(colorScheme))
                            .background(HarnessColors.primary(colorScheme))
                            .clipShape(RoundedRectangle(cornerRadius: HarnessLayout.controlRadius, style: .continuous))
                    }
                    .buttonStyle(HarnessPressScaleButtonStyle())
                    .disabled(draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                    .opacity(draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? 0.45 : 1)
                }
                .padding(.top, 4)
            }
            .padding(16)
            .frame(maxWidth: 400)
            .background(HarnessColors.surface(colorScheme))
            .clipShape(RoundedRectangle(cornerRadius: HarnessLayout.settingsCardRadius, style: .continuous))
            .padding(.horizontal, 16)
            .offset(y: presented ? 0 : 16)
            .opacity(presented ? 1 : 0)
            .scaleEffect(presented ? 1 : 0.96)
        }
        .onAppear {
            withAnimation(.easeOut(duration: 0.24)) {
                presented = true
            }
        }
    }
}
