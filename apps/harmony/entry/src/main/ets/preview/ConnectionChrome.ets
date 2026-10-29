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

/** 微信式无网络条：单行 + 警示 + 右侧重新连接。 */
@Component
export struct ServiceBanner {
  @Prop serviceState: string = 'ready';
  @Prop dismissed: boolean = false;
  @Prop useDark: boolean = false;
  onRetry: () => void = () => {
  };
  onDismiss: () => void = () => {
  };

  private message(): string {
    if (this.serviceState === 'checking') {
      return '正在检查服务状态…';
    }
    return '当前无法连接服务，请检查网络与 API 地址。';
  }

  private barBackground(): string {
    return this.useDark ? '#2A2221' : '#FCECEA';
  }

  private barForeground(): string {
    return this.useDark ? '#C4B8B5' : '#6B5B58';
  }

  build() {
    if (this.dismissed || this.serviceState === 'ready') {
      Blank();
      return;
    }
    Row() {
      Stack() {
        Circle({ width: 18, height: 18 })
          .fill('#FA5151')
        Text('!')
          .fontSize(12)
          .fontWeight(FontWeight.Bold)
          .fontColor('#FFFFFF')
      }
      .margin({ right: 8 })

      Text(this.message())
        .fontSize(13)
        .fontColor(this.barForeground())
        .layoutWeight(1)
        .maxLines(2)
        .textOverflow({ overflow: TextOverflow.Ellipsis })

      if (this.serviceState === 'unavailable') {
        Text('重新连接')
          .fontSize(13)
          .fontColor(HarnessColors.linkText(this.useDark))
          .margin({ left: 8 })
          .onClick(() => this.onRetry())
      }
    }
    .width('100%')
    .padding({ left: 12, right: 12, top: 9, bottom: 9 })
    .backgroundColor(this.barBackground())
  }
}

/** Pattern：ProblemDetails 卡片（服务已就绪时的结构化错误）。 */
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
