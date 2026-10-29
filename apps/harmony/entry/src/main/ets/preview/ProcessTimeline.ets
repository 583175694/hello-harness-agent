import { HarnessColors } from '../coreui/HarnessColors';
import { ProcessTimelineNodeDot, ProcessTimelineToolRailIcon } from './ProcessTimelineRailIcon';
import { toolActivityInlineSummary, toolActivityPrimaryLine } from './ToolActivityLabel';
import { harnessPressOpacity } from '../coreui/HarnessPressScale';
import { HarnessChevronDownIcon } from '../coreui/HarnessVectorIcons';
import { PreviewLocalPreferences } from './PreviewLocalPreferences';
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

function reasoningContentEnterTransition(reduceMotion: boolean): TransitionEffect {
  const duration = reduceMotion ? 0 : 160;
  return TransitionEffect.OPACITY.animation({ duration: duration, curve: Curve.EaseOut });
}

function reasoningContentExitTransition(reduceMotion: boolean): TransitionEffect {
  if (reduceMotion) {
    return TransitionEffect.IDENTITY;
  }
  return TransitionEffect.IDENTITY;
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
  @Prop reduceMotion: boolean = PreviewLocalPreferences.reduceMotion;
  onOpenWorkbench: (toolCallId: string) => void = () => {
  };

  @State open: boolean = true;
  @State userExpanded: boolean = false;
  @State headerPressed: boolean = false;

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

  private toggleOpen(): void {
    this.userExpanded = true;
    this.open = !this.open;
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
      Row({ space: 6 }) {
        Text(processHeaderLabel(this.blocks, this.running))
          .fontSize(13)
          .fontColor(HarnessColors.mutedText(this.useDark))
          .maxLines(1)
          .textOverflow({ overflow: TextOverflow.Ellipsis })
          .opacity(harnessPressOpacity(this.headerPressed))
        HarnessChevronDownIcon({
          color: HarnessColors.mutedText(this.useDark),
          size: 14,
          stroke: 2,
        })
          .rotate({ angle: this.open ? 0 : -90 })
          .animation(this.reduceMotion ? { duration: 0 } : { duration: 140, curve: Curve.EaseOut })
          .opacity(harnessPressOpacity(this.headerPressed))
      }
      .width('100%')
      .justifyContent(FlexAlign.Start)
      .padding({ top: 4, bottom: 4 })
      .onTouch((event: TouchEvent) => {
        if (event.type === TouchType.Down) {
          this.headerPressed = true;
        }
        if (event.type === TouchType.Up || event.type === TouchType.Cancel) {
          this.headerPressed = false;
        }
      })
      .onClick(() => this.toggleOpen())

      if (this.open) {
        Column({ space: 0 }) {
          ForEach(this.renderableBlocks(), (block: ProcessBlockRow, index: number) => {
            ProcessTimelineRow({
              block: block,
              isLast: index === this.renderableBlocks().length - 1,
              useDark: this.useDark,
              reduceMotion: this.reduceMotion,
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
  @Prop reduceMotion: boolean = PreviewLocalPreferences.reduceMotion;
  onOpenWorkbench: (toolCallId: string) => void = () => {
  };

  @State reasoningOpen: boolean = false;
  @State toolPressed: boolean = false;
  @State reasoningTriggerPressed: boolean = false;

  private toggleReasoning(): void {
    if (this.reduceMotion) {
      this.reasoningOpen = !this.reasoningOpen;
      return;
    }
    animateTo({ duration: 220, curve: Curve.EaseOut }, () => {
      this.reasoningOpen = !this.reasoningOpen;
    });
  }

  build() {
    Row({ space: 8 }) {
      Column() {
        Row() {
          if (this.block.kind === 'tool_activity') {
            ProcessTimelineToolRailIcon({
              toolName: this.block.name,
              status: this.block.status,
              useDark: this.useDark,
            })
          } else {
            ProcessTimelineNodeDot({ useDark: this.useDark })
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
          Row() {
            if (toolActivityInlineSummary(this.block.name, this.block.name, this.block.summary) !== null) {
              Text(this.block.name.length > 0 ? this.block.name : 'tool')
                .fontSize(14)
                .lineHeight(20)
                .fontColor(HarnessColors.mutedText(this.useDark))
                .maxLines(1)
                .textOverflow({ overflow: TextOverflow.Ellipsis })
                .flexShrink(1)
              Text('|')
                .fontSize(14)
                .lineHeight(20)
                .fontColor(HarnessColors.mutedText(this.useDark))
                .opacity(0.45)
                .margin({ left: 6, right: 6 })
              Text(this.block.summary)
                .fontSize(14)
                .lineHeight(20)
                .fontColor(HarnessColors.mutedText(this.useDark))
                .maxLines(1)
                .textOverflow({ overflow: TextOverflow.Ellipsis })
                .layoutWeight(1)
            } else {
              Text(toolActivityPrimaryLine(this.block.name, this.block.name, this.block.summary))
                .fontSize(14)
                .lineHeight(20)
                .fontColor(HarnessColors.mutedText(this.useDark))
                .maxLines(1)
                .textOverflow({ overflow: TextOverflow.Ellipsis })
                .width('100%')
            }
          }
          .width('100%')
          .height(20)
          .opacity(harnessPressOpacity(this.toolPressed))
          .onTouch((event: TouchEvent) => {
            if (event.type === TouchType.Down) {
              this.toolPressed = true;
            }
            if (event.type === TouchType.Up || event.type === TouchType.Cancel) {
              this.toolPressed = false;
            }
          })
          .onClick(() => {
            if (this.block.id.length > 0) {
              this.onOpenWorkbench(this.block.id);
            }
          })
        } else if (this.block.kind === 'reasoning') {
          Column({ space: 0 }) {
            Row({ space: 6 }) {
              Text(reasoningTriggerLabel(this.block.streaming, this.block.durationMs))
                .fontSize(14)
                .fontColor(HarnessColors.mutedText(this.useDark))
                .lineHeight(22)
                .maxLines(1)
                .textOverflow({ overflow: TextOverflow.Ellipsis })
                .opacity(harnessPressOpacity(this.reasoningTriggerPressed))
              HarnessChevronDownIcon({
                color: HarnessColors.mutedText(this.useDark),
                size: 14,
                stroke: 2,
              })
                .width(16)
                .height(16)
                .rotate({ angle: this.reasoningOpen || this.block.streaming ? -90 : 90 })
                .animation(this.reduceMotion ? { duration: 0 } : { duration: 140, curve: Curve.EaseOut })
                .accessibilityText(this.reasoningOpen ? '收起思考过程' : '展开思考过程')
                .opacity(harnessPressOpacity(this.reasoningTriggerPressed))
            }
            .height(20)
            .onTouch((event: TouchEvent) => {
              if (event.type === TouchType.Down) {
                this.reasoningTriggerPressed = true;
              }
              if (event.type === TouchType.Up || event.type === TouchType.Cancel) {
                this.reasoningTriggerPressed = false;
              }
            })
            .onClick(() => this.toggleReasoning())
            if (this.reasoningOpen || this.block.streaming) {
              Text(this.block.content)
                .fontSize(14)
                .lineHeight(22)
                .fontColor(HarnessColors.mutedText(this.useDark))
                .padding({ left: 12, right: 12, top: 6, bottom: 8 })
                .transition(
                  TransitionEffect.asymmetric(
                    reasoningContentEnterTransition(this.reduceMotion),
                    reasoningContentExitTransition(this.reduceMotion),
                  ),
                )
            }
          }
          .width('100%')
          .clip(true)
          .animation(this.reduceMotion ? { duration: 0 } : { duration: 220, curve: Curve.EaseOut })
        } else {
          Text(this.block.content)
            .fontSize(14)
            .lineHeight(20)
            .fontColor(HarnessColors.secondaryText(this.useDark))
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
  }
}
