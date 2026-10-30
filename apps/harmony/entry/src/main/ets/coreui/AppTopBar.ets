import { HarnessColors } from './HarnessColors';

/** Gate A primitive：AppTopBar */
@Component
export struct AppTopBar {
  @Prop title: string = '';
  @Prop useDark: boolean = false;
  @Prop leadingGlyph: string = '☰';
  /** 为 false 时顶栏与内容区同色、无下分隔线（如 Reader 全屏预览）。 */
  @Prop showBottomBorder: boolean = true;
  onLeadingClick: () => void = () => {
  };
  @BuilderParam trailing: () => void = this.defaultTrailing;

  @Builder
  defaultTrailing() {
    Blank().width(40)
  }

  build() {
    Row() {
      Text(this.leadingGlyph)
        .fontSize(this.leadingGlyph === '‹' ? 24 : 20)
        .width(40)
        .fontColor(HarnessColors.primaryText(this.useDark))
        .onClick(() => this.onLeadingClick())
      Text(this.title)
        .fontSize(18)
        .fontWeight(FontWeight.Medium)
        .fontColor(HarnessColors.primaryText(this.useDark))
        .layoutWeight(1)
        .textAlign(TextAlign.Center)
      Row() {
        this.trailing()
      }.width(40)
    }
    .width('100%')
    .height(48)
    .padding({ left: 4, right: 4, top: 2, bottom: 4 })
    .backgroundColor(HarnessColors.canvas(this.useDark))
    .border({
      width: { bottom: this.showBottomBorder ? 1 : 0 },
      color: HarnessColors.composerBorderColor(this.useDark),
    })
  }
}
