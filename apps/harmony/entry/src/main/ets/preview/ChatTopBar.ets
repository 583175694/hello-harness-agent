import { HarnessColors } from '../coreui/HarnessColors';
import { ConnectionPill } from './ConnectionChrome';
import {
  ChatTopBarActionCapsule,
  ChatTopBarCapsuleIcon,
  ChatTopBarCircleChrome,
} from './ChatTopBarChrome';

/** Pattern：Chat 顶栏（白底圆/胶囊 + Download PNG 图标 + 裸标题）。 */
@Component
export struct ChatTopBar {
  @Prop title: string = '';
  @Prop connectionState: string = 'idle';
  @Prop runSummary: string = '';
  @Prop workbenchBadge: number = 0;
  @Prop useDark: boolean = false;
  onOpenDrawer: () => void = () => {
  };
  onNewConversation: () => void = () => {
  };
  onOpenWorkbench: () => void = () => {
  };

  @Builder
  topBarPngIcon(resource: Resource) {
    Image(resource)
      .width(22)
      .height(22)
      .objectFit(ImageFit.Contain)
  }

  build() {
    Row() {
      ChatTopBarCircleChrome({
        useDark: this.useDark,
        onClick: () => this.onOpenDrawer(),
        icon: () => {
          this.topBarPngIcon($r('app.media.harness_chat_top_sessions'));
        },
      })

      Text(this.title)
        .fontSize(17)
        .fontWeight(FontWeight.Medium)
        .fontColor(HarnessColors.primaryText(this.useDark))
        .maxLines(1)
        .textOverflow({ overflow: TextOverflow.Ellipsis })
        .layoutWeight(1)
        .textAlign(TextAlign.Start)
        .padding({ left: 12, right: 8 })

      if (this.connectionState !== 'live' && this.connectionState !== 'idle') {
        ConnectionPill({ connectionState: this.connectionState, useDark: this.useDark })
      }

      ChatTopBarActionCapsule({
        useDark: this.useDark,
        content: () => {
          ChatTopBarCapsuleIcon({
            useDark: this.useDark,
            onClick: () => this.onNewConversation(),
            icon: () => {
              this.topBarPngIcon($r('app.media.harness_chat_top_new_chat'));
            },
          })
          ChatTopBarCapsuleIcon({
            useDark: this.useDark,
            onClick: () => this.onOpenWorkbench(),
            icon: () => {
              this.topBarPngIcon($r('app.media.harness_chat_top_more'));
            },
          })
        },
      })
    }
    .width('100%')
    .padding({ left: 12, right: 12, top: 2, bottom: 6 })
    .backgroundColor(HarnessColors.canvas(this.useDark))
    .safeAreaPadding([SafeAreaType.SYSTEM], [SafeAreaEdge.TOP])
  }
}
