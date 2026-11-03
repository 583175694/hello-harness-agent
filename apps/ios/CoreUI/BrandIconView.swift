import SwiftUI
import UIKit

/** 皮皮虾品牌图（`Harness/Resources/brand-icon-app.png`；Android 经 sync-brand-icon.sh 同步）。 */
struct BrandIconView: View {
    var size: CGFloat = 40

    var body: some View {
        Group {
            if let uiImage = UIImage(named: "brand-icon-app", in: .main, compatibleWith: nil) {
                Image(uiImage: uiImage)
                    .resizable()
                    .scaledToFit()
            } else {
                RoundedRectangle(cornerRadius: 12)
                    .fill(HarnessColors.primary)
            }
        }
        .frame(width: size, height: size)
        .accessibilityHidden(true)
    }
}
