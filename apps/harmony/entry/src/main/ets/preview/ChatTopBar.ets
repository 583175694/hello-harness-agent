import { HarnessColors } from '../coreui/HarnessColors';
import { HarnessTopBarIconButton } from '../coreui/HarnessTopBarIconButton';
import { HarnessMenuIcon, HarnessWorkbenchIcon } from '../coreui/HarnessVectorIcons';
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
      HarnessTopBarIconButton({
        useDark: this.useDark,
        accessibilityLabel: '打开会话列表',
        onClick: () => this.onOpenDrawer(),
        icon: () => {
          HarnessMenuIcon({
            color: HarnessColors.primaryText(this.useDark),
            barWidth: 20,
            barHeight: 2.75,
            gap: 5,
          });
        },
      })
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

      HarnessTopBarIconButton({
        useDark: this.useDark,
        accessibilityLabel: '打开工作台',
        onClick: () => this.onOpenWorkbench(),
        icon: () => {
          HarnessWorkbenchIcon({ color: HarnessColors.primaryText(this.useDark) });
        },
      })
    }
    .width('100%')
    .padding({ left: 4, right: 4, top: 2, bottom: 2 })
    .backgroundColor(HarnessColors.canvas(this.useDark))
    .safeAreaPadding([SafeAreaType.SYSTEM], [SafeAreaEdge.TOP])
  }
}
