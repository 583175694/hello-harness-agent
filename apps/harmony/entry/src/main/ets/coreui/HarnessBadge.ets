import { HarnessColors } from './HarnessColors';

/** Gate A primitive：Badge（Workbench 角标等）。 */
@Component
export struct HarnessBadge {
  @Prop label: string = '';
  @Prop useDark: boolean = false;

  build() {
    if (this.label.length === 0) {
      Blank();
      return;
    }
    Text(this.label)
      .fontSize(11)
      .fontColor(HarnessColors.primaryText(this.useDark))
      .padding({ left: 8, right: 8, top: 4, bottom: 4 })
      .backgroundColor(HarnessColors.userBubbleBg(this.useDark))
      .borderRadius(8)
  }
}
