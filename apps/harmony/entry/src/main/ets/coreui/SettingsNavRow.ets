import { HarnessColors } from './HarnessColors';
import { SettingsSoftDivider } from './SettingsSoftDivider';
import { harnessPressOpacity } from './HarnessPressScale';

const SETTINGS_ROW_MIN_HEIGHT: number = 48;

@Component
export struct SettingsNavRow {
  @Prop title: string = '';
  @Prop subtitle: string = '';
  @Prop trailingValue: string = '';
  @Prop useDark: boolean = false;
  @Prop showDivider: boolean = false;
  @Prop showChevron: boolean = true;
  onClick: () => void = () => {
  };

  @State private pressed: boolean = false;

  build() {
    Column() {
      Row() {
        Text(this.title)
          .fontSize(16)
          .fontColor(HarnessColors.secondaryText(this.useDark))
          .layoutWeight(1)
        if (this.trailingValue.length > 0) {
          Text(this.trailingValue)
            .fontSize(14)
            .fontColor(HarnessColors.mutedText(this.useDark))
            .margin({ right: 4 })
        }
        if (this.showChevron) {
          Text('›')
            .fontSize(16)
            .fontColor(HarnessColors.mutedText(this.useDark))
        }
      }
      .width('100%')
      .height(SETTINGS_ROW_MIN_HEIGHT)
      .padding({ left: 16, right: 16 })
      .opacity(harnessPressOpacity(this.pressed, true))
      .onTouch((event: TouchEvent) => {
        if (event.type === TouchType.Down) {
          this.pressed = true;
        }
        if (event.type === TouchType.Up || event.type === TouchType.Cancel) {
          this.pressed = false;
        }
      })
      .onClick(() => this.onClick())
      if (this.subtitle.length > 0) {
        Text(this.subtitle)
          .fontSize(12)
          .fontColor(HarnessColors.mutedText(this.useDark))
          .width('100%')
          .padding({ left: 16, right: 16, bottom: 8 })
          .margin({ top: -8 })
      }
      if (this.showDivider) {
        SettingsSoftDivider({ useDark: this.useDark })
      }
    }
    .width('100%')
  }
}
