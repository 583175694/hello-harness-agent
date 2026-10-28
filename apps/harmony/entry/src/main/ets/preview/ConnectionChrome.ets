import { HarnessColors } from '../coreui/HarnessColors';

/** Pattern：ConnectionPill（顶栏连接态文案）。 */
@Component
export struct ConnectionPill {
  @Prop connectionState: string = 'idle';
  @Prop useDark: boolean = false;

  label(): string {
    const conn = this.connectionState;
    if (conn === 'live' || conn === 'idle') {
      return '';
    }
    if (conn === 'offline') {
      return '离线';
    }
    if (conn === 'reconnecting') {
      return '重连中';
    }
    return conn;
  }

  build() {
    if (this.label().length === 0) {
      Blank();
      return;
    }
    Text(this.label())
      .fontSize(11)
      .fontColor(HarnessColors.secondaryText(this.useDark))
  }
}

/** Pattern：ServiceBanner（Agent 服务假状态）。 */
@Component
export struct ServiceBanner {
  @Prop serviceState: string = 'ready';
  @Prop dismissed: boolean = false;
  @Prop useDark: boolean = false;
  onDismiss: () => void = () => {
  };

  build() {
    if (this.dismissed || this.serviceState === 'ready') {
      Blank();
      return;
    }
    Row() {
      Text('无法连接 Agent 服务（Preview 假状态）')
        .fontSize(14)
        .fontColor(HarnessColors.dangerText(this.useDark))
        .layoutWeight(1)
      Text('关闭')
        .fontSize(14)
        .fontColor(HarnessColors.secondaryText(this.useDark))
        .onClick(() => this.onDismiss())
    }
    .width('100%')
    .padding(12)
    .backgroundColor(HarnessColors.dangerBackground(this.useDark))
  }
}

/** Pattern：ProblemDetails 卡片。 */
@Component
export struct ProblemDetailsCard {
  @Prop title: string = '';
  @Prop detail: string = '';
  @Prop useDark: boolean = false;

  build() {
    if (this.title.length === 0 && this.detail.length === 0) {
      Blank();
      return;
    }
    Text(`${this.title}\n${this.detail}`.trim())
      .fontSize(14)
      .fontColor(HarnessColors.primaryText(this.useDark))
      .width('100%')
      .padding(12)
      .backgroundColor(HarnessColors.subtleBg(this.useDark))
      .borderRadius(12)
      .margin({ left: 12, right: 12 })
  }
}
