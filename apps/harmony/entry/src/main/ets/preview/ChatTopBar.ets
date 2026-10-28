import { HarnessColors } from '../coreui/HarnessColors';
import { ConnectionPill } from './ConnectionChrome';

/** Pattern：Chat 顶栏（对齐 RN chat-top-bar：Drawer / 标题 / 连接 / 工作台）。 */
@Component
export struct ChatTopBar {
  @Prop title: string = '';
  @Prop connectionState: string = 'idle';
  @Prop runSummary: string = '';
  /** Gate A：与 Android/iOS 一致，顶栏不展示 Workbench 角标（计数在工作台内体现）。 */
  @Prop workbenchBadge: number = 0;
  @Prop useDark: boolean = false;
  onOpenDrawer: () => void = () => {
  };
  onOpenWorkbench: () => void = () => {
  };

  build() {
    Row() {
      Text('≡')
        .fontSize(22)
        .fontWeight(FontWeight.Medium)
        .width(40)
        .height(40)
        .textAlign(TextAlign.Center)
        .fontColor(HarnessColors.primaryText(this.useDark))
        .accessibilityText('打开会话列表')
        .onClick(() => this.onOpenDrawer())
      Text(this.title)
        .fontSize(13)
        .fontWeight(FontWeight.Bold)
        .fontColor(HarnessColors.primaryText(this.useDark))
        .maxLines(1)
        .textOverflow({ overflow: TextOverflow.Ellipsis })
        .layoutWeight(1)
        .textAlign(TextAlign.Center)
        .padding({ left: 8, right: 8 })

      if (this.connectionState !== 'live' && this.connectionState !== 'idle') {
        ConnectionPill({ connectionState: this.connectionState, useDark: this.useDark })
      }

      Row({ space: 3 }) {
        Column()
          .width(3)
          .height(16)
          .borderRadius(1)
          .backgroundColor(HarnessColors.primaryText(this.useDark))
        Column()
          .width(3)
          .height(16)
          .borderRadius(1)
          .backgroundColor(HarnessColors.primaryText(this.useDark))
        Column()
          .width(3)
          .height(16)
          .borderRadius(1)
          .backgroundColor(HarnessColors.primaryText(this.useDark))
      }
      .width(40)
      .height(40)
      .justifyContent(FlexAlign.Center)
      .accessibilityText('打开工作台')
      .onClick(() => this.onOpenWorkbench())
    }
    .width('100%')
    .padding({ left: 4, right: 4, top: 2, bottom: 2 })
    .backgroundColor(HarnessColors.canvas(this.useDark))
    .border({ width: { bottom: 1 }, color: HarnessColors.composerBorderColor(this.useDark) })
    .safeAreaPadding([SafeAreaType.SYSTEM], [SafeAreaEdge.TOP])
  }
}
