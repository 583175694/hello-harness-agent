import { router } from '@kit.ArkUI';
import { AppScaffold } from '../coreui/AppScaffold';
import { AppTopBar } from '../coreui/AppTopBar';
import { HarnessColors } from '../coreui/HarnessColors';
import { PreviewMarkdownText } from '../coreui/PreviewMarkdownText';
import { PreviewLocalPreferences } from '../preview/PreviewLocalPreferences';

@Entry
@Component
struct PreviewReaderPage {
  @State title: string = 'Reader';
  @State body: string = '';
  @State isArtifact: boolean = false;
  @State themeDark: boolean = PreviewLocalPreferences.themeDark;

  aboutToAppear(): void {
    const params = router.getParams() as Record<string, string | boolean>;
    this.title = `${params['title'] ?? 'Reader'}`;
    this.body = `${params['body'] ?? ''}`;
    this.isArtifact = params['isArtifact'] === true || params['isArtifact'] === 'true';
    this.themeDark = PreviewLocalPreferences.themeDark;
  }

  onPageShow(): void {
    this.themeDark = PreviewLocalPreferences.themeDark;
  }

  build() {
    Column() {
      AppScaffold({
        topBar: () => {
          AppTopBar({
            title: this.title,
            useDark: this.themeDark,
            leadingGlyph: '‹',
            onLeadingClick: () => router.back(),
          })
        },
        content: () => {
          Scroll() {
            Column() {
              if (this.isArtifact || this.body.indexOf('---') >= 0) {
                Text(this.body.length > 0 ? this.body : '--- diff preview')
                  .fontSize(12)
                  .fontFamily('monospace')
                  .fontColor(HarnessColors.primaryText(this.themeDark))
                  .width('100%')
              } else {
                PreviewMarkdownText({
                  markdown: this.body.length > 0 ? this.body : '# 空报告',
                  fontSize: PreviewLocalPreferences.contentFontSize,
                  useDark: this.themeDark,
                })
                  .width('100%')
              }
            }
            .width('100%')
            .padding(16)
            .backgroundColor(HarnessColors.surface(this.themeDark))
            .borderRadius(12)
            .border({ width: 1, color: HarnessColors.composerBorder(this.themeDark) })
            .margin(16)
          }
          .layoutWeight(1)
          .width('100%')
        },
      })
    }
    .width('100%')
    .height('100%')
    .backgroundColor(HarnessColors.canvas(this.themeDark))
  }
}
