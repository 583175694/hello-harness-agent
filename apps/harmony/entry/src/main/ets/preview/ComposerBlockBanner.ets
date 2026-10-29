import { HarnessColors } from '../coreui/HarnessColors';
import { PreviewComposerBlockKind } from './PreviewAuth';

@Component
export struct ComposerBlockBanner {
  @Prop blockKind: PreviewComposerBlockKind = PreviewComposerBlockKind.NONE;
  @Prop useDark: boolean = false;
  onLoginClick: () => void = () => {
  };

  build() {
    if (this.blockKind === PreviewComposerBlockKind.NONE) {
      Blank();
    } else {
      Row({ space: 8 }) {
        Text('ⓘ')
          .fontSize(14)
          .fontColor(HarnessColors.secondaryText(this.useDark))
        Text(this.message())
          .fontSize(12)
          .fontColor(HarnessColors.primaryText(this.useDark))
          .layoutWeight(1)
        if (this.blockKind === PreviewComposerBlockKind.LOGIN_REQUIRED) {
          Text('去登录')
            .fontSize(12)
            .fontColor(HarnessColors.linkText(this.useDark))
            .onClick(() => this.onLoginClick())
        }
      }
      .width('100%')
      .padding({ left: 12, right: 12, top: 10, bottom: 10 })
      .backgroundColor(HarnessColors.subtleBg(this.useDark))
      .borderRadius(8)
    }
  }

  private message(): string {
    if (this.blockKind === PreviewComposerBlockKind.LOGIN_REQUIRED) {
      return '已配置 API，请先登录后再发送消息。';
    }
    if (this.blockKind === PreviewComposerBlockKind.TRANSCRIPT_INCOMPATIBLE) {
      return '当前会话与所选模型不兼容，请新建会话或更换模型。';
    }
    return '';
  }
}
