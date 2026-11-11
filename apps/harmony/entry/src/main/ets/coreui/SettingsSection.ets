import { HarnessColors } from './HarnessColors';

const CARD_RADIUS: number = 16;

/** Kimi 式设置分组：可选外置小标题 + 白卡片（无描边）。 */
@Component
export struct SettingsSection {
  /** 卡片内旧版标题；留空则仅渲染 content（配合 sectionLabel）。 */
  @Prop title: string = '';
  /** 卡片上方灰色分组名（如 Agent、连接）。 */
  @Prop sectionLabel: string = '';
  @Prop useDark: boolean = false;
  @BuilderParam content: () => void = this.defaultContent;

  @Builder
  defaultContent() {
  }

  build() {
    Column({ space: 0 }) {
      if (this.sectionLabel.length > 0) {
        Text(this.sectionLabel)
          .fontSize(12)
          .fontColor('#A3A3A0')
          .width('100%')
          .margin({ left: 4, bottom: 6 })
      }
      Column({ space: 0 }) {
        if (this.title.length > 0) {
          Text(this.title)
            .fontSize(15)
            .fontWeight(FontWeight.Medium)
            .fontColor(HarnessColors.primaryText(this.useDark))
            .width('100%')
            .margin({ bottom: 12 })
        }
        this.content()
      }
      .width('100%')
      .padding(this.title.length > 0 ? 16 : 0)
      .backgroundColor(HarnessColors.surface(this.useDark))
      .borderRadius(CARD_RADIUS)
    }
    .width('100%')
  }
}
