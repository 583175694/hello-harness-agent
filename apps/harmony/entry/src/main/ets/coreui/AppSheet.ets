import { HarnessColors } from './HarnessColors';
import { PreviewLocalPreferences } from '../preview/PreviewLocalPreferences';

/** Gate A primitive：AppSheet（底栏 Modal，与 Workbench / Android Dialog 同型）。 */
@Component
export struct AppSheet {
  @Prop visible: boolean = false;
  @Prop title: string = '';
  @Prop actionLabel: string = '完成';
  @Prop rows: string[] = [];
  @Prop minBodyHeight: number = 0;
  @Prop contentBottomPadding: number = 16;
  @Prop useDark: boolean = false;
  @Prop reduceMotion: boolean = PreviewLocalPreferences.reduceMotion;
  onPick: (row: string) => void = () => {
  };
  onClose: () => void = () => {
  };

  @State presentProgress: number = 0;

  @Watch('visible')
  onVisibleChange(): void {
    this.presentProgress = this.visible ? 1 : 0;
  }

  private sheetSlideOffsetVp(): number {
    return (1 - this.presentProgress) * 1000;
  }

  build() {
    if (!this.visible && this.presentProgress <= 0.01) {
      Blank();
      return;
    }
    Stack({ alignContent: Alignment.Bottom }) {
      Column()
        .width('100%')
        .height('100%')
        .backgroundColor('#00000066')
        .opacity(this.presentProgress)
        .animation({
          duration: this.reduceMotion ? 0 : 280,
          curve: Curve.EaseOut,
        })
        .onClick(() => this.onClose())
      Column({ space: 8 }) {
        Row() {
          Column()
            .width(36)
            .height(4)
            .backgroundColor(HarnessColors.mutedText(this.useDark))
            .borderRadius(2)
        }
        .width('100%')
        .justifyContent(FlexAlign.Center)
        .padding({ top: 8, bottom: 4 })

        if (this.title.length > 0 || (this.actionLabel.length > 0 && this.actionLabel !== '完成')) {
          Row() {
            if (this.title.length > 0) {
              Text(this.title).fontSize(16).fontWeight(FontWeight.Medium)
                .fontColor(HarnessColors.primaryText(this.useDark))
                .layoutWeight(1)
            } else {
              Blank().layoutWeight(1)
            }
            if (this.actionLabel.length > 0 && this.actionLabel !== '完成') {
              Text(this.actionLabel).fontSize(14).fontWeight(FontWeight.Medium)
                .fontColor(HarnessColors.linkText(this.useDark))
                .onClick(() => this.onClose())
            }
          }.width('100%')
        }
        Column({ space: 0 }) {
          ForEach(this.rows, (row: string) => {
            Text(row)
              .fontSize(15)
              .fontColor(HarnessColors.primaryText(this.useDark))
              .width('100%')
              .height(52)
              .padding({ left: 8, right: 8 })
              .onClick(() => this.onPick(row))
          }, (row: string) => row)
        }
        .width('100%')

        Blank().height(24)
      }
      .width('100%')
      .constraintSize({ minHeight: this.minBodyHeight > 0 ? this.minBodyHeight : undefined })
      .padding({
        left: 16,
        right: 16,
        top: 8,
        bottom: this.contentBottomPadding,
      })
      .backgroundColor(HarnessColors.surface(this.useDark))
      .borderRadius({ topLeft: 20, topRight: 20 })
      .border({ width: { top: 1 }, color: HarnessColors.composerBorderColor(this.useDark) })
      .translate({ y: this.sheetSlideOffsetVp() })
      .opacity(this.presentProgress)
      .animation({
        duration: this.reduceMotion ? 0 : 280,
        curve: Curve.EaseOut,
      })
    }
    .width('100%')
    .height('100%')
  }
}
