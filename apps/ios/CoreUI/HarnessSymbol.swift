import SwiftUI

/// Preview / Gate A：SF Symbol 统一 medium 字重，与 Material Rounded 线框感对齐。
enum HarnessSymbol {
    static func image(_ name: String, size: CGFloat) -> some View {
        Image(systemName: name)
            .font(.system(size: size, weight: .medium))
            .symbolRenderingMode(.monochrome)
    }
}
