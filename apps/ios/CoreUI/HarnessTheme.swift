import SwiftUI

enum HarnessColors {
    static let canvas = Color(red: 0.97, green: 0.97, blue: 0.96)
    static let drawer = Color(red: 0.98, green: 0.98, blue: 0.98)
    static let surface = Color.white
    static let primary = Color(red: 0.09, green: 0.09, blue: 0.09)
    static let secondary = Color(red: 0.33, green: 0.33, blue: 0.32)
    static let muted = Color(red: 0.54, green: 0.54, blue: 0.53)
    static let link = Color(red: 0.25, green: 0.37, blue: 0.47)
    static let border = Color(red: 0.87, green: 0.87, blue: 0.86)
    static let danger = Color(red: 0.60, green: 0.29, blue: 0.25)
    static let subtle = Color(red: 0.95, green: 0.95, blue: 0.94)
    static let userBubble = Color(red: 0.93, green: 0.95, blue: 0.99)
    static let userBubbleBorder = Color(red: 0.86, green: 0.90, blue: 0.97)
    static let composerBorder = Color(red: 0.93, green: 0.93, blue: 0.92)
    static let primaryForeground = Color.white
}

enum HarnessCopy {
    static let newSessionWelcome = "欢迎回来，想从哪里开始？"
}

enum GateAPreviewFixtures {
    static let landing = "empty-landing.json"
    static let demoShowcase = "rich-session-showcase.json"
    /// Dev Menu 置顶演示 fixture（越靠前越靠上）
    static let demoFixtureOrder = [
        "rich-session-showcase.json",
        "stock-market-review.json",
    ]

    static func demoFixtureSortRank(_ fileName: String) -> Int {
        demoFixtureOrder.firstIndex(of: fileName) ?? Int.max
    }
}

/// 对齐 RN `tailwind.config.js` + Android `HarnessLayout`.
enum HarnessLayout {
    static let controlRadius: CGFloat = 8
    static let panelRadius: CGFloat = 12
    static let bubbleRadius: CGFloat = 22
    static let composerPlusSize: CGFloat = 44
    static let composerSendSize: CGFloat = 32
    static let composerMinInputHeight: CGFloat = 44
    /// 约 5 行 × 22pt 行高，对齐 Android / RN Composer。
    static let composerMaxInputHeight: CGFloat = 120
    static let composerInputMaxLines = 5
    static let iconToolbarSize: CGFloat = 40
    /// 对齐 Web `calc(100vw - 24px)` 与 Android `planOverlayHorizontalInset`。
    static let planOverlayHorizontalInset: CGFloat = 12
    /// 对齐 Web `.workbench-tool-slider`：12 / 16 / 14，行内 gap 8。
    static let workbenchStepFooterTopPadding: CGFloat = 12
    static let workbenchStepFooterHorizontalPadding: CGFloat = 16
    static let workbenchStepFooterBottomPadding: CGFloat = 14
    static let workbenchStepFooterContentGap: CGFloat = 8
    static let workbenchStepFooterMinSafeInset: CGFloat = 34
}

struct AppScaffold<Content: View>: View {
    let title: String
    @ViewBuilder var content: () -> Content

    var body: some View {
        VStack(spacing: 0) {
            AppTopBar(title: title)
            VStack(alignment: .leading, spacing: 8) {
                content()
            }
            .padding(.horizontal, 16)
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
            .background(HarnessColors.canvas)
        }
    }
}

struct AppTopBar: View {
    let title: String

    var body: some View {
        VStack(spacing: 0) {
            HStack {
                Text(title)
                    .font(.headline)
                Spacer()
            }
            .frame(height: 48)
            .padding(.horizontal, 8)
            .background(HarnessColors.surface)
            Divider()
        }
    }
}

struct HarnessBadge: View {
    let text: String

    var body: some View {
        Text(text)
            .font(.caption)
            .padding(.horizontal, 8)
            .padding(.vertical, 2)
            .background(HarnessColors.subtle)
            .clipShape(Capsule())
    }
}

struct AppButton: View {
    let title: String
    let action: () -> Void

    var body: some View {
        Button(title, action: action)
            .buttonStyle(.borderedProminent)
            .tint(HarnessColors.primary)
    }
}

struct AppDivider: View {
    var body: some View {
        Divider().overlay(HarnessColors.border)
    }
}
