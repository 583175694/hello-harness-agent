import { HarnessColors } from '../coreui/HarnessColors';

@Component
export struct PreviewComposerPeekBar {
  @Prop title: string = '';
  @Prop subtitle: string = '';
  @Prop useDark: boolean = false;
  onPress: () => void = () => {
  };

  build() {
    if (this.title.length === 0) {
      Blank();
      return;
    }
    Row({ space: 8 }) {
      Column({ space: 2 }) {
        Text(this.title).fontSize(14).fontWeight(FontWeight.Medium)
          .fontColor(HarnessColors.primaryText(this.useDark))
        if (this.subtitle.length > 0) {
          Text(this.subtitle).fontSize(12).fontColor(HarnessColors.mutedText(this.useDark))
        }
      }.layoutWeight(1)
      Text('›').fontSize(18).fontColor(HarnessColors.mutedText(this.useDark))
    }
    .width('100%')
    .padding(12)
    .backgroundColor(HarnessColors.surface(this.useDark))
    .border({ width: { top: 1, bottom: 1 }, color: HarnessColors.borderColor(this.useDark) })
    .onClick(() => this.onPress())
  }
}
