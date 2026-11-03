import MarkdownUI
import SwiftUI

extension Theme {
    /// 对话 Markdown 主题：对齐 Android Markwon + `HarnessColors` / 用户字号。
    static func harnessChat(colorScheme: ColorScheme, contentFontSize: CGFloat) -> Theme {
        let body = max(13, min(20, contentFontSize))
        let primary = HarnessColors.primary(colorScheme)
        let secondary = HarnessColors.secondary(colorScheme)
        let link = HarnessColors.link(colorScheme)
        let subtle = HarnessColors.subtle(colorScheme)
        let border = HarnessColors.composerBorder(colorScheme)

        return Theme()
            .text {
                ForegroundColor(primary)
                FontSize(body)
            }
            .strong {
                FontWeight(.semibold)
            }
            .emphasis {
                FontStyle(.italic)
            }
            .strikethrough {
                StrikethroughStyle(.single)
            }
            .link {
                ForegroundColor(link)
            }
            .code {
                FontFamilyVariant(.monospaced)
                FontSize(.em(0.88))
                ForegroundColor(primary)
                BackgroundColor(subtle)
            }
            .codeBlock { configuration in
                configuration.label
                    .markdownTextStyle {
                        FontFamilyVariant(.monospaced)
                        FontSize(.em(0.88))
                        ForegroundColor(primary)
                        BackgroundColor(subtle)
                    }
                    .padding(10)
                    .markdownMargin(top: .em(0.5), bottom: .em(0.75))
                    .overlay(
                        RoundedRectangle(cornerRadius: 8)
                            .stroke(border, lineWidth: 1),
                    )
                    .background(RoundedRectangle(cornerRadius: 8).fill(subtle))
            }
            .heading1 { configuration in
                configuration.label
                    .markdownMargin(top: .em(1.1), bottom: .em(0.45))
                    .markdownTextStyle {
                        FontWeight(.semibold)
                        FontSize(.em(1.75))
                        ForegroundColor(primary)
                    }
            }
            .heading2 { configuration in
                configuration.label
                    .markdownMargin(top: .em(0.95), bottom: .em(0.4))
                    .markdownTextStyle {
                        FontWeight(.semibold)
                        FontSize(.em(1.4))
                        ForegroundColor(primary)
                    }
            }
            .heading3 { configuration in
                configuration.label
                    .markdownMargin(top: .em(0.85), bottom: .em(0.35))
                    .markdownTextStyle {
                        FontWeight(.semibold)
                        FontSize(.em(1.22))
                        ForegroundColor(primary)
                    }
            }
            .heading4 { configuration in
                configuration.label
                    .markdownMargin(top: .em(0.75), bottom: .em(0.3))
                    .markdownTextStyle {
                        FontWeight(.semibold)
                        FontSize(.em(1.08))
                        ForegroundColor(primary)
                    }
            }
            .heading5 { configuration in
                configuration.label
                    .markdownMargin(top: .em(0.65), bottom: .em(0.25))
                    .markdownTextStyle {
                        FontWeight(.medium)
                        FontSize(.em(1))
                        ForegroundColor(primary)
                    }
            }
            .heading6 { configuration in
                configuration.label
                    .markdownMargin(top: .em(0.55), bottom: .em(0.2))
                    .markdownTextStyle {
                        FontWeight(.medium)
                        FontSize(.em(0.92))
                        ForegroundColor(secondary)
                    }
            }
            .blockquote { configuration in
                configuration.label
                    .padding(.leading, 12)
                    .markdownTextStyle {
                        ForegroundColor(secondary)
                    }
                    .overlay(alignment: .leading) {
                        Rectangle()
                            .fill(border)
                            .frame(width: 3)
                    }
                    .markdownMargin(top: .em(0.5), bottom: .em(0.5))
            }
            .thematicBreak {
                Divider().overlay(border)
            }
            .bulletedListMarker { configuration in
                HarnessChatListBullet(
                    level: configuration.listLevel,
                    color: primary,
                    contentFontSize: body,
                )
            }
            .table { configuration in
                configuration.label
                    .fixedSize(horizontal: false, vertical: true)
                    .markdownMargin(top: .em(0.5), bottom: .em(0.75))
            }
            .tableCell { configuration in
                configuration.label
                    .markdownTextStyle {
                        FontSize(body)
                    }
                    .padding(.horizontal, 8)
                    .padding(.vertical, 6)
            }
    }
}

/// 比 MarkdownUI 默认 `circle.fill`（字号约 ÷3）更细的对话区无序列表圆点。
private struct HarnessChatListBullet: View {
    let level: Int
    let color: Color
    let contentFontSize: CGFloat

    var body: some View {
        let dot = max(3.5, contentFontSize * 0.19)
        Group {
            switch min(level, 3) {
            case 1:
                Circle()
                    .fill(color)
                    .frame(width: dot, height: dot)
            case 2:
                Circle()
                    .stroke(color, lineWidth: 0.75)
                    .frame(width: dot, height: dot)
            default:
                RoundedRectangle(cornerRadius: 0.75)
                    .fill(color)
                    .frame(width: dot, height: dot)
            }
        }
        .frame(width: contentFontSize * 1.35, alignment: .trailing)
    }
}
