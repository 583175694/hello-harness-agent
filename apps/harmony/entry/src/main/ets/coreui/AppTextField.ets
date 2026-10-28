import { HarnessColors } from './HarnessColors';

/** Gate A primitive：AppTextField */
@Component
export struct AppTextField {
  @Prop label: string = '';
  @Prop placeholder: string = '';
  @Prop text: string = '';
  @Prop useDark: boolean = false;
  onChange: (value: string) => void = () => {
  };

  build() {
    Column({ space: 4 }) {
      if (this.label.length > 0) {
        Text(this.label).fontSize(12).fontColor(HarnessColors.mutedText(this.useDark))
      }
      TextInput({ placeholder: this.placeholder, text: this.text })
        .width('100%')
        .fontColor(HarnessColors.primaryText(this.useDark))
        .backgroundColor(HarnessColors.surface(this.useDark))
        .onChange((v: string) => this.onChange(v))
    }
    .width('100%')
  }
}
