import { HarnessColors } from '../coreui/HarnessColors';

/** 对齐 RN `ConversationEmptyHero`：40vp 皮皮虾 BrandIcon + 欢迎语。 */
@Component
export struct ChatLandingHero {
  @Prop welcomeText: string = '欢迎回来，想从哪里开始？';
  @Prop useDark: boolean = false;
  @Prop showDemoEntry: boolean = false;
  onOpenDemo: () => void = () => {};

  build() {
    Column({ space: 16 }) {
      Row({ space: 14 }) {
        Image($r('app.media.brand_icon_app'))
          .width(40)
          .height(40)
          .objectFit(ImageFit.Contain)
        Text(this.welcomeText)
          .fontSize(18)
          .fontWeight(FontWeight.Medium)
          .fontColor(HarnessColors.primaryText(this.useDark))
          .maxLines(2)
          .textOverflow({ overflow: TextOverflow.Ellipsis })
      }
      .justifyContent(FlexAlign.Center)

      if (this.showDemoEntry) {
        Text('加载演示 Mock（对话 + 工作台）')
          .fontSize(15)
          .fontColor(HarnessColors.linkText(this.useDark))
          .id('landing-load-demo-mock')
          .onClick(() => {
            this.onOpenDemo();
          })
        Text('或：设置 → 演示场景')
          .fontSize(12)
          .fontColor(HarnessColors.mutedText(this.useDark))
      }
    }
    .width('100%')
    .alignItems(HorizontalAlign.Center)
    .padding({ left: 20, right: 20 })
  }
}
