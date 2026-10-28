import { HarnessColors } from './HarnessColors';
import { HarnessDivider } from './HarnessDivider';

@Component
export struct SettingsNavRow {
  @Prop title: string = '';
  @Prop subtitle: string = '';
  @Prop useDark: boolean = false;
  @Prop showDivider: boolean = true;
  onClick: () => void = () => {
  };

  build() {
    Column() {
      Row() {
        Column({ space: 4 }) {
          Text(this.title)
            .fontSize(15)
            .fontColor(HarnessColors.primaryText(this.useDark))
          if (this.subtitle.length > 0) {
            Text(this.subtitle)
              .fontSize(12)
              .fontColor(HarnessColors.mutedText(this.useDark))
          }
        }
        .layoutWeight(1)
        .alignItems(HorizontalAlign.Start)
        Text('›')
          .fontSize(18)
          .fontColor(HarnessColors.mutedText(this.useDark))
          .padding({ left: 8 })
      }
      .width('100%')
      .padding({ top: 12, bottom: 12 })
      .onClick(() => this.onClick())
      if (this.showDivider) {
        HarnessDivider({ useDark: this.useDark })
      }
    }
    .width('100%')
  }
}
