import { HarnessColors } from '../coreui/HarnessColors';

@Component
export struct PreviewComposerOverlay {
  @Prop modelLabel: string = '默认模型';
  @Prop useDark: boolean = false;
  var onModelClick: () => void = () => {
  };
  var onAttachClick: () => void = () => {
  };
  var onSkillClick: () => void = () => {
  };

  build() {
    Row({ space: 8 }) {
      Text(this.modelLabel)
        .fontSize(11)
        .padding({ left: 10, right: 10, top: 6, bottom: 6 })
        .backgroundColor(HarnessColors.subtleBg(this.useDark))
        .fontColor(HarnessColors.primaryText(this.useDark))
        .borderRadius(999)
        .onClick(() => this.onModelClick())
      Text('附件')
        .fontSize(11)
        .padding({ left: 10, right: 10, top: 6, bottom: 6 })
        .backgroundColor(HarnessColors.subtleBg(this.useDark))
        .fontColor(HarnessColors.primaryText(this.useDark))
        .borderRadius(999)
        .onClick(() => this.onAttachClick())
      Text('Skill')
        .fontSize(11)
        .padding({ left: 10, right: 10, top: 6, bottom: 6 })
        .backgroundColor(HarnessColors.subtleBg(this.useDark))
        .fontColor(HarnessColors.primaryText(this.useDark))
        .borderRadius(999)
        .onClick(() => this.onSkillClick())
    }
    .width('100%')
    .padding({ left: 12, right: 12, bottom: 4 })
  }
}
