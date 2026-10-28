import { HarnessColors } from '../coreui/HarnessColors';
import { Spinner } from '../coreui/Spinner';
import { ProcessBlockRow } from './PreviewModels';

function processHeaderLabel(blocks: ProcessBlockRow[], running: boolean): string {
  let ms = 0;
  blocks.forEach((b: ProcessBlockRow) => {
    if (b.kind === 'reasoning') {
      ms += b.durationMs;
    } else if (b.kind === 'tool_activity' && b.duration.length > 0) {
      const digits = b.duration.replace(/[^\d]/g, '');
      const n = parseInt(digits, 10);
      if (!isNaN(n)) {
        ms += n * 1000;
      }
    }
  });
  if (ms <= 0) {
    return '处理过程';
  }
  const totalSeconds = Math.max(Math.floor(ms / 1000), 0);
  if (totalSeconds < 60) {
    return `已用时 ${totalSeconds} 秒`;
  }
  return `已用时 ${Math.floor(totalSeconds / 60)} 分 ${totalSeconds % 60}秒`;
}

function reasoningTriggerLabel(streaming: boolean, durationMs: number): string {
  if (streaming) {
    return 'Thinking...';
  }
  if (durationMs > 0) {
    return `Thought for ${Math.floor(durationMs / 1000)} seconds`;
  }
  return 'Thought';
}

/** 对齐 Android/iOS AssistantProcessTimeline */
@Component
export struct AssistantProcessTimeline {
  @Prop blocks: ProcessBlockRow[] = [];
  @Prop running: boolean = false;
  @Prop finalOutputVisible: boolean = false;
  @Prop useDark: boolean = false;
  onOpenWorkbench: (toolCallId: string) => void = () => {
  };

  @State open: boolean = true;
  @State userExpanded: boolean = false;

  aboutToAppear(): void {
    this.open = !(this.finalOutputVisible && !this.running);
  }

  private renderableBlocks(): ProcessBlockRow[] {
    return this.blocks.filter((block: ProcessBlockRow) => {
      if (block.kind === 'tool_activity' || block.kind === 'reasoning') {
        return true;
      }
      return block.kind === 'text' && block.content.trim().length > 0;
    });
  }

  aboutToUpdate(): void {
    if (this.running) {
      this.open = true;
    }
    if (!this.userExpanded && this.finalOutputVisible && !this.running && this.open) {
      setTimeout(() => {
        if (!this.userExpanded && this.finalOutputVisible && !this.running) {
          this.open = false;
        }
      }, 1000);
    }
  }

  build() {
    if (this.blocks.length === 0) {
      Blank()
      return;
    }
    Column({ space: 0 }) {
      Row() {
        Text(processHeaderLabel(this.blocks, this.running))
          .fontSize(13)
          .fontColor(HarnessColors.mutedText(this.useDark))
          .layoutWeight(1)
        Text(this.open ? '▾' : '▸')
          .fontSize(12)
          .fontColor(HarnessColors.mutedText(this.useDark))
      }
      .width('100%')
      .padding({ top: 4, bottom: 4 })
      .onClick(() => {
        this.userExpanded = true;
        animateTo({
          duration: 220,
          curve: Curve.EaseOut,
        }, () => {
          this.open = !this.open;
        });
      })

      if (this.open) {
        Column({ space: 0 }) {
          ForEach(this.renderableBlocks(), (block: ProcessBlockRow, index: number) => {
            ProcessTimelineRow({
              block: block,
              isLast: index === this.renderableBlocks().length - 1,
              useDark: this.useDark,
              onOpenWorkbench: this.onOpenWorkbench,
            })
          }, (block: ProcessBlockRow, index: number) => `${index}-${block.kind}-${block.id}`)
        }
        .padding({ left: 4 })
      }
    }
    .width('100%')
    .padding({ top: 4, bottom: 4 })
  }
}

@Component
struct ProcessTimelineRow {
  @Prop block: ProcessBlockRow = {
    kind: '',
    id: '',
    name: '',
    summary: '',
    status: '',
    duration: '',
    statusLabel: '',
    content: '',
    durationMs: 0,
    streaming: false,
  };
  @Prop isLast: boolean = false;
  @Prop useDark: boolean = false;
  onOpenWorkbench: (toolCallId: string) => void = () => {
  };

  @State reasoningOpen: boolean = false;

  build() {
    Row({ space: 8 }) {
      Column() {
        Row() {
          if (this.block.kind === 'tool_activity') {
            if (this.block.status === 'running') {
              Spinner({ label: '', useDark: this.useDark })
            } else {
              Text(this.block.status === 'failed' ? '✕' : '⌕')
                .fontSize(14)
                .fontColor(
                  this.block.status === 'failed' ? HarnessColors.dangerText(this.useDark) :
                    HarnessColors.mutedText(this.useDark),
                )
            }
          } else if (this.block.kind === 'reasoning') {
            Text('◎').fontSize(12).fontColor(HarnessColors.mutedText(this.useDark))
          } else {
            Circle({ width: 6, height: 6 })
              .fill(HarnessColors.composerBorder(this.useDark))
          }
        }
        .width('100%')
        .height(20)
        .justifyContent(FlexAlign.Center)

        if (!this.isLast) {
          Row()
            .width(1)
            .layoutWeight(1)
            .margin({ top: 2 })
            .backgroundColor(HarnessColors.composerBorder(this.useDark))
        }
      }
      .width(22)
      .height('100%')
      .alignItems(HorizontalAlign.Center)

      Column({ space: 0 }) {
        if (this.block.kind === 'tool_activity') {
          Column({ space: 0 }) {
            Text(this.block.name.length > 0 ? this.block.name : 'tool')
              .fontSize(14)
              .fontColor(HarnessColors.secondaryText(this.useDark))
              .maxLines(1)
              .textOverflow({ overflow: TextOverflow.Ellipsis })
              .height(20)
            if (this.block.summary.length > 0 && this.block.summary !== this.block.name) {
              Text(this.block.summary)
                .fontSize(12)
                .fontColor(HarnessColors.mutedText(this.useDark))
                .maxLines(1)
                .textOverflow({ overflow: TextOverflow.Ellipsis })
                .margin({ top: 2 })
            }
          }
          .width('100%')
          .onClick(() => {
            if (this.block.id.length > 0) {
              this.onOpenWorkbench(this.block.id);
            }
          })
        } else if (this.block.kind === 'reasoning') {
          Row() {
            Text(reasoningTriggerLabel(this.block.streaming, this.block.durationMs))
              .fontSize(14)
              .fontColor(HarnessColors.mutedText(this.useDark))
              .maxLines(1)
              .textOverflow({ overflow: TextOverflow.Ellipsis })
            Blank().layoutWeight(1)
            Text('›')
              .fontSize(16)
              .fontWeight(FontWeight.Medium)
              .fontColor(HarnessColors.mutedText(this.useDark))
              .width(18)
              .height(18)
              .textAlign(TextAlign.Center)
              .rotate({ angle: this.reasoningOpen ? -90 : 90 })
              .accessibilityText(this.reasoningOpen ? '收起思考过程' : '展开思考过程')
          }
          .width('100%')
          .height(20)
          .onClick(() => {
            animateTo({ duration: 220, curve: Curve.EaseOut }, () => {
              this.reasoningOpen = !this.reasoningOpen;
            });
          })
          if (this.reasoningOpen || this.block.streaming) {
            Text(this.block.content)
              .fontSize(12)
              .fontColor(HarnessColors.secondaryText(this.useDark))
              .margin({ top: 4 })
              .transition(TransitionEffect.OPACITY.animation({ duration: 160, curve: Curve.EaseOut }))
          }
        } else {
          Text(this.block.content)
            .fontSize(12)
            .fontColor(HarnessColors.mutedText(this.useDark))
            .padding({ top: 4, bottom: 4 })
        }
      }
      .layoutWeight(1)
      .alignItems(HorizontalAlign.Start)
    }
    .width('100%')
    .constraintSize({ minHeight: 42 })
    .padding({ top: 4, bottom: 8 })
    .alignItems(VerticalAlign.Top)
    .animation({ duration: 220, curve: Curve.EaseOut })
  }
}
