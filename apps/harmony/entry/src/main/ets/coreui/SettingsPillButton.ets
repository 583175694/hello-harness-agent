import { HarnessColors } from './HarnessColors';
import { harnessPressOpacity } from './HarnessPressScale';

/** 设置页底部胶囊主/次按钮（对齐 Kimi 账号安全页）。 */
@Component
export struct SettingsPillButton {
  @Prop label: string = '';
  @Prop useDark: boolean = false;
  @Prop primary: boolean = true;
  @Prop enabled: boolean = true;
  onClick: () => void = () => {
  };

  @State private pressed: boolean = false;

  build() {
    Text(this.label)
      .fontSize(16)
      .fontColor(
        this.primary
          ? HarnessColors.primaryForeground(this.useDark)
          : HarnessColors.secondaryText(this.useDark)
      )
      .width('100%')
      .textAlign(TextAlign.Center)
      .padding({ top: 14, bottom: 14 })
      .borderRadius(999)
      .backgroundColor(
        this.primary
          ? (this.useDark ? HarnessColors.primaryDark : HarnessColors.primary)
          : HarnessColors.subtleBg(this.useDark)
      )
      .opacity(harnessPressOpacity(this.pressed, this.enabled, this.enabled ? 1 : 0.45))
      .onTouch((event: TouchEvent) => {
        if (!this.enabled) {
          return;
        }
        if (event.type === TouchType.Down) {
          this.pressed = true;
        }
        if (event.type === TouchType.Up || event.type === TouchType.Cancel) {
          this.pressed = false;
        }
      })
      .onClick(() => {
        if (this.enabled) {
          this.onClick();
        }
      })
  }
}
