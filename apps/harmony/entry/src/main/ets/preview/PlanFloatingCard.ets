import { HarnessColors } from '../coreui/HarnessColors';
import { PlanStepRow } from './PreviewModels';

/** 对齐 Web `calc(100vw - 24px)` / Android planOverlayHorizontalInset。 */
const PLAN_OVERLAY_HORIZONTAL_INSET: number = 12;

/** Plan 悬浮 pill + 上方展开详情（对齐 RN PlanFloatingCard / 产品参考）。 */
@Component
export struct PlanFloatingCard {
  @Prop explanation: string = '';
  @Prop steps: PlanStepRow[] = [];
  @Prop initialExpanded: boolean = false;
  @State expanded: boolean = false;
  /** Workbench 打开时保持收起，避免与 Artifact diff 区域视觉争抢（UI 回归 #1）。 */
  @Prop lockCollapsed: boolean = false;
  @Prop useDark: boolean = false;

  aboutToAppear(): void {
    if (this.initialExpanded) {
      this.expanded = true;
    }
  }

  activeIndex(): number {
    const inProgress = this.steps.findIndex((s) => s.status === 'in_progress');
    if (inProgress >= 0) {
      return inProgress;
    }
    for (let i = this.steps.length - 1; i >= 0; i--) {
      if (this.steps[i].status === 'completed') {
        return i;
      }
    }
    return 0;
  }

  allCompleted(): boolean {
    return this.steps.length > 0 && this.steps.every((s) => s.status === 'completed');
  }

  build() {
    if (this.steps.length === 0 || this.allCompleted()) {
      Blank();
      return;
    }
    const stepNumber = Math.min(this.activeIndex() + 1, this.steps.length);
    Column() {
      if (this.expanded && !this.lockCollapsed) {
        Scroll() {
          Column({ space: 6 }) {
            if (this.explanation.length > 0) {
              Text(this.explanation)
                .fontSize(12)
                .fontColor(HarnessColors.mutedText(this.useDark))
                .width('100%')
            }
            ForEach(this.steps, (step: PlanStepRow) => {
              Row({ space: 8 }) {
                this.stepIcon(step.status)
                Text(step.step)
                  .fontSize(14)
                  .fontColor(this.stepTextColor(step.status))
                  .layoutWeight(1)
              }
              .width('100%')
              .alignItems(VerticalAlign.Top)
              .padding({ top: 4, bottom: 4 })
            }, (step: PlanStepRow) => step.step + step.status)
          }
          .width('100%')
        }
        .width('100%')
        .constraintSize({ maxWidth: 360, maxHeight: 280 })
        .padding({ left: 14, right: 14, top: 12, bottom: 12 })
        .backgroundColor(HarnessColors.surface(this.useDark))
        .border({ width: 1, color: HarnessColors.composerBorderColor(this.useDark) })
        .borderRadius(12)
        .margin({ bottom: 8 })
        .shadow({ radius: 8, color: '#14000000', offsetY: 2 })
      }
      Row({ space: 8 }) {
        LoadingProgress()
          .width(14)
          .height(14)
          .color(HarnessColors.primaryText(this.useDark))
        Text(`第 ${stepNumber} / ${this.steps.length} 步`)
          .fontSize(14)
          .fontWeight(FontWeight.Medium)
          .fontColor(HarnessColors.primaryText(this.useDark))
      }
      .height(38)
      .padding({ left: 16, right: 16 })
      .backgroundColor(HarnessColors.surface(this.useDark))
      .border({ width: 1, color: HarnessColors.composerBorderColor(this.useDark) })
      .borderRadius(999)
      .shadow({ radius: 6, color: '#14000000', offsetY: 2 })
      .onClick(() => {
        if (!this.lockCollapsed) {
          this.expanded = !this.expanded;
        }
      })
    }
    .width('100%')
    .padding({
      left: PLAN_OVERLAY_HORIZONTAL_INSET,
      right: PLAN_OVERLAY_HORIZONTAL_INSET,
      top: 4,
      bottom: 4,
    })
    .alignItems(HorizontalAlign.Center)
  }

  @Builder
  stepIcon(status: string) {
    if (status === 'completed') {
      Text('✓')
        .fontSize(12)
        .fontColor(HarnessColors.mutedText(this.useDark))
        .width(16)
        .textAlign(TextAlign.Center)
    } else if (status === 'in_progress') {
      LoadingProgress()
        .width(14)
        .height(14)
        .color(HarnessColors.primaryText(this.useDark))
    } else {
      Column()
        .width(10)
        .height(10)
        .border({ width: 1, color: HarnessColors.mutedText(this.useDark) })
        .borderRadius(5)
    }
  }

  stepTextColor(status: string): string | Color {
    if (status === 'completed') {
      return HarnessColors.mutedText(this.useDark);
    }
    if (status === 'in_progress') {
      return HarnessColors.primaryText(this.useDark);
    }
    return HarnessColors.secondaryText(this.useDark);
  }
}
