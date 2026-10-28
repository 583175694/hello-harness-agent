import { HarnessColors } from './HarnessColors';

/** Gate A primitive：Divider（对齐 43 §16.2）。 */
@Component
export struct HarnessDivider {
  @Prop useDark: boolean = false;

  build() {
    Divider()
      .strokeWidth(1)
      .color(HarnessColors.border)
      .width('100%')
  }
}
