import { HarnessColors } from './HarnessColors';

/** Gate A primitive：ListRow（Dev Menu / Settings 行） */
@Component
export struct ListRow {
  @Prop title: string = '';
  @Prop subtitle: string = '';
  @Prop useDark: boolean = false;
  onClick: () => void = () => {
  };

  build() {
    Column({ space: 4 }) {
      Text(this.title)
        .fontSize(16)
        .fontColor(HarnessColors.primaryText(this.useDark))
      if (this.subtitle.length > 0) {
        Text(this.subtitle).fontSize(12).fontColor(HarnessColors.mutedText(this.useDark))
      }
    }
    .width('100%')
    .padding(12)
    .onClick(() => this.onClick())
  }
}
