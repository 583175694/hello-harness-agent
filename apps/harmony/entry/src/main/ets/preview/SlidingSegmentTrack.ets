import { HarnessColors } from '../coreui/HarnessColors';
import { PreviewLocalPreferences } from './PreviewLocalPreferences';

const SLIDE_MS = 240;

/** 对齐 RN `SlidingSegmentTrack`：equal-width 分段 + 滑动高亮。 */
@Component
export struct SlidingSegmentTrack {
  @Prop segmentCount: number = 1;
  @Prop selectedIndex: number = 0;
  @Prop useDark: boolean = false;
  @Prop reduceMotion: boolean = PreviewLocalPreferences.reduceMotion;
  @BuilderParam content: () => void = this.defaultContent;

  @State private trackWidth: number = 0;
  @State private indicatorOffset: number = 0;

  @Builder
  defaultContent() {
  }

  aboutToAppear(): void {
    this.syncIndicator(false);
  }

  aboutToUpdate(): void {
    this.syncIndicator(!this.reduceMotion);
  }

  private clampedIndex(): number {
    const count = Math.max(this.segmentCount, 1);
    if (this.selectedIndex < 0) {
      return 0;
    }
    if (this.selectedIndex >= count) {
      return count - 1;
    }
    return this.selectedIndex;
  }

  private syncIndicator(animate: boolean): void {
    const count = Math.max(this.segmentCount, 1);
    const segmentWidth = this.trackWidth / count;
    const target = segmentWidth * this.clampedIndex();
    if (!animate || this.reduceMotion) {
      this.indicatorOffset = target;
      return;
    }
    animateTo({ duration: SLIDE_MS, curve: Curve.EaseOut }, () => {
      this.indicatorOffset = target;
    });
  }

  build() {
    const count = Math.max(this.segmentCount, 1);
    const segmentWidth = this.trackWidth / count;

    Stack({ alignContent: Alignment.Start }) {
      if (this.trackWidth > 0) {
        Row()
          .width(segmentWidth)
          .height(34)
          .backgroundColor(HarnessColors.primaryText(this.useDark))
          .borderRadius(6)
          .translate({ x: this.indicatorOffset })
      }
      this.content();
    }
    .width('100%')
    .padding(2)
    .backgroundColor(HarnessColors.subtleBg(this.useDark))
    .borderRadius(8)
    .onAreaChange((_, newArea: Area) => {
      const w = Number(newArea.width);
      if (w > 0 && w !== this.trackWidth) {
        this.trackWidth = w;
        this.syncIndicator(false);
      }
    })
  }
}
