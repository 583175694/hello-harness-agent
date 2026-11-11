import { HarnessColors } from './HarnessColors';

/** Gate A primitive：AppButton（对齐 43 §16.2）。 */
@Component
export struct AppButton {
  @Prop label: string = '';
  @Prop primary: boolean = true;
  @Prop enabled: boolean = true;
  @Prop useDark: boolean = false;
  onClick: () => void = () => {
  };

  build() {
    Text(this.label)
      .fontSize(14)
      .fontColor(this.primary ? '#FFFFFF' : HarnessColors.primaryText(this.useDark))
      .textAlign(TextAlign.Center)
      .width('100%')
      .padding(12)
      .constraintSize({ minHeight: 48 })
      .backgroundColor(this.primary ? HarnessColors.linkText(this.useDark) : HarnessColors.subtleBg(this.useDark))
      .borderRadius(8)
      .opacity(this.enabled ? 1 : 0.5)
      .onClick(() => {
        if (this.enabled) {
          this.onClick();
        }
      })
  }
}
