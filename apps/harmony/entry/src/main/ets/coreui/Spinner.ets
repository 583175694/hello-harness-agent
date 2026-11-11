import { HarnessColors } from './HarnessColors';
import { PreviewLocalPreferences } from '../preview/PreviewLocalPreferences';

/** Gate A primitive：Spinner（Reduce Motion 时静态）。 */
@Component
export struct Spinner {
  @Prop label: string = '加载中…';
  @Prop useDark: boolean = false;

  build() {
    Row({ space: 8 }) {
      if (PreviewLocalPreferences.reduceMotion) {
        Text('◌').fontSize(16).fontColor(HarnessColors.mutedText(this.useDark))
      } else {
        LoadingProgress().width(24).height(24).color(HarnessColors.linkText(this.useDark))
      }
      if (this.label.length > 0) {
        Text(this.label).fontSize(12).fontColor(HarnessColors.mutedText(this.useDark))
      }
    }
  }
}
