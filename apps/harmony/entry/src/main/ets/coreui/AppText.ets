import { HarnessColors } from './HarnessColors';

/** Gate A primitive：AppText（对齐 43 §16.2）。 */
@Component
export struct AppText {
  @Prop text: string = '';
  @Prop fontSize: number = 15;
  @Prop muted: boolean = false;
  @Prop useDark: boolean = false;

  build() {
    Text(this.text)
      .fontSize(this.fontSize)
      .fontColor(this.muted ? HarnessColors.mutedText(this.useDark) : HarnessColors.primaryText(this.useDark))
      .width('100%')
  }
}
