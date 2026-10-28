import { HarnessColors } from './HarnessColors';

/** Gate A primitive：AppTopBar */
@Component
export struct AppTopBar {
  @Prop title: string = '';
  @Prop useDark: boolean = false;
  @Prop leadingGlyph: string = '☰';
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
    .border({ width: { bottom: 1 }, color: HarnessColors.composerBorderColor(this.useDark) })
  }
}
