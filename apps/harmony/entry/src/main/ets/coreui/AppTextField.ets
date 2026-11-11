import { HarnessColors } from './HarnessColors';

const CONTROL_RADIUS: number = 8;
const FIELD_MIN_HEIGHT: number = 44;

/** Gate A：设置页风格输入（外置标签 + 浅底 + 1px 描边）。 */
@Component
export struct AppTextField {
  @Prop label: string = '';
  @Prop placeholder: string = '';
  @Prop text: string = '';
  @Prop useDark: boolean = false;
  onChange: (value: string) => void = () => {
  };

  build() {
    Column({ space: 6 }) {
      if (this.label.length > 0) {
        Text(this.label)
          .fontSize(12)
          .fontColor(HarnessColors.mutedText(this.useDark))
      }
      TextInput({ placeholder: this.placeholder, text: this.text })
        .width('100%')
        .height(FIELD_MIN_HEIGHT)
        .fontSize(16)
        .fontColor(HarnessColors.secondaryText(this.useDark))
        .placeholderColor(HarnessColors.placeholderText(this.useDark))
        .padding({ left: 12, right: 12 })
        .borderRadius(CONTROL_RADIUS)
        .backgroundColor(HarnessColors.subtleBg(this.useDark))
        .border({ width: 1, color: HarnessColors.composerBorderColor(this.useDark) })
        .onChange((v: string) => this.onChange(v))
    }
    .width('100%')
  }
}
