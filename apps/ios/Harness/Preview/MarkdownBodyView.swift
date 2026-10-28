import SwiftUI

struct MarkdownBodyView: View {
    let markdown: String

    var body: some View {
        if let attributed = try? AttributedString(markdown: markdown) {
            Text(attributed)
                .frame(maxWidth: .infinity, alignment: .leading)
        } else {
            Text(markdown)
                .frame(maxWidth: .infinity, alignment: .leading)
        }
    }
}
