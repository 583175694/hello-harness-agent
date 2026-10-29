import { HarnessColors } from '../coreui/HarnessColors';

/** Workbench 各子 Tab 统一空态（标题 + 说明，居中）。 */
@Component
export struct WorkbenchTabEmptyState {
  @Prop title: string = '';
  @Prop message: string = '';
  @Prop useDark: boolean = false;

  build() {
    Column() {
      Column({ space: 8 }) {
        Text(this.title)
          .fontSize(15)
          .fontWeight(FontWeight.Medium)
          .fontColor(HarnessColors.primaryText(this.useDark))
        Text(this.message)
          .fontSize(12)
          .fontColor(HarnessColors.mutedText(this.useDark))
          .textAlign(TextAlign.Center)
      }
    }
    .width('100%')
    .height('100%')
    .justifyContent(FlexAlign.Center)
    .padding({ left: 16, right: 16, top: 48, bottom: 48 })
  }
}
