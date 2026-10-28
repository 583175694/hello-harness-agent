import { HarnessColors } from './HarnessColors';

/** Gate A 设置页卡片分区（对齐 Android SettingsSection / RN rounded-panel）。 */
@Component
export struct SettingsSection {
  @Prop title: string = '';
  @Prop useDark: boolean = false;
  @BuilderParam content: () => void = this.defaultContent;

  @Builder
  defaultContent() {
  }

  build() {
    Column({ space: 12 }) {
      if (this.title.length > 0) {
        Text(this.title)
          .fontSize(15)
          .fontWeight(FontWeight.Medium)
          .fontColor(HarnessColors.primaryText(this.useDark))
          .width('100%')
      }
      this.content()
    }
    .width('100%')
    .padding(16)
    .backgroundColor(HarnessColors.surface(this.useDark))
    .borderRadius(12)
    .border({ width: 1, color: HarnessColors.composerBorderColor(this.useDark) })
  }
}
