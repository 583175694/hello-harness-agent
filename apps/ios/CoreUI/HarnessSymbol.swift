import SwiftUI

/// Preview / Gate A：SF Symbol 统一 medium 字重，与 Material Rounded 线框感对齐。
enum HarnessSymbol {
    static func image(_ name: String, size: CGFloat) -> some View {
        Image(systemName: name)
            .font(.system(size: size, weight: .medium))
            .symbolRenderingMode(.monochrome)
    }
}

private let chatTopBarAccentDot = Color(red: 0, green: 0.77, blue: 0.70)

/// Gate A Chat 顶栏矢量图标（对齐参考 PNG / Android drawable）。
enum ChatTopBarIcons {
    static func sessionDrawer(size: CGFloat, color: Color) -> some View {
        ZStack(alignment: .topTrailing) {
            VStack(spacing: size * 0.22) {
                Capsule().fill(color).frame(width: size * 0.78, height: max(2, size * 0.11))
                Capsule().fill(color).frame(width: size * 0.78, height: max(2, size * 0.11))
                Capsule().fill(color).frame(width: size * 0.78, height: max(2, size * 0.11))
            }
            .frame(width: size, height: size)
            Circle()
                .fill(chatTopBarAccentDot)
                .frame(width: max(4, size * 0.22), height: max(4, size * 0.22))
                .offset(x: size * 0.06, y: -size * 0.02)
        }
        .frame(width: size, height: size)
    }

    static func newChat(size: CGFloat, color: Color) -> some View {
        ZStack {
            Circle()
                .stroke(color, lineWidth: max(1.5, size * 0.09))
                .frame(width: size * 0.88, height: size * 0.88)
            Path { path in
                let w = size * 0.88
                path.move(to: CGPoint(x: w * 0.5, y: w * 0.32))
                path.addLine(to: CGPoint(x: w * 0.5, y: w * 0.68))
                path.move(to: CGPoint(x: w * 0.32, y: w * 0.5))
                path.addLine(to: CGPoint(x: w * 0.68, y: w * 0.5))
            }
            .stroke(color, style: StrokeStyle(lineWidth: max(1.5, size * 0.09), lineCap: .round))
        }
        .frame(width: size, height: size)
    }

    static func moreVertical(size: CGFloat, color: Color) -> some View {
        VStack(spacing: size * 0.14) {
            Circle().fill(color).frame(width: max(2.5, size * 0.12), height: max(2.5, size * 0.12))
            Circle().fill(color).frame(width: max(2.5, size * 0.12), height: max(2.5, size * 0.12))
            Circle().fill(color).frame(width: max(2.5, size * 0.12), height: max(2.5, size * 0.12))
        }
        .frame(width: size, height: size)
    }

    static func panelRight(size: CGFloat, color: Color) -> some View {
        ZStack {
            RoundedRectangle(cornerRadius: HarnessLayout.controlRadius * size / 20, style: .continuous)
                .stroke(color, lineWidth: max(1.5, size * 0.1))
                .frame(width: size, height: size)
            Path { path in
                let s = size
                path.move(to: CGPoint(x: s * 0.62, y: s * 0.28))
                path.addLine(to: CGPoint(x: s * 0.78, y: s * 0.44))
                path.move(to: CGPoint(x: s * 0.42, y: s * 0.48))
                path.addLine(to: CGPoint(x: s * 0.68, y: s * 0.74))
            }
            .stroke(color, style: StrokeStyle(lineWidth: max(1.5, size * 0.1), lineCap: .round))
        }
        .frame(width: size, height: size)
    }
}
