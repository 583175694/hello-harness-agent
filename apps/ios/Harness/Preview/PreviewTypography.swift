import SwiftUI

private struct PreviewContentFontSizeKey: EnvironmentKey {
    static let defaultValue: CGFloat = 15
}

extension EnvironmentValues {
    var previewContentFontSize: CGFloat {
        get { self[PreviewContentFontSizeKey.self] }
        set { self[PreviewContentFontSizeKey.self] = newValue }
    }
}
