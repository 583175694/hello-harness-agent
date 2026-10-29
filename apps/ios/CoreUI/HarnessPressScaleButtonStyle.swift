import SwiftUI

/// 简洁按压：瞬时透明度，无缩放动画。
struct HarnessPressButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .opacity(configuration.isPressed ? 0.72 : 1)
    }
}

typealias HarnessPressScaleButtonStyle = HarnessPressButtonStyle

/// RN 顶栏 `h-10 w-10 rounded-control active:bg-subtle`。
struct HarnessTopBarIconButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .frame(width: HarnessLayout.iconToolbarSize, height: HarnessLayout.iconToolbarSize)
            .background(
                configuration.isPressed ? HarnessColors.subtle : Color.clear,
                in: RoundedRectangle(cornerRadius: HarnessLayout.controlRadius, style: .continuous)
            )
            .opacity(configuration.isPressed ? 0.88 : 1)
    }
}
