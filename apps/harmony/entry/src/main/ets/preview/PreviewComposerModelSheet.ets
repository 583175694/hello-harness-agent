import { HarnessColors } from '../coreui/HarnessColors';
import { PreviewLocalPreferences } from './PreviewLocalPreferences';
import { SlidingSegmentTrack } from './SlidingSegmentTrack';

interface PreviewModelDef {
  id: string;
  label: string;
  reasoningOptions: string[];
}

const PREVIEW_MODELS: PreviewModelDef[] = [
  { id: 'deepseek-chat', label: 'DeepSeek Chat', reasoningOptions: ['off', 'low', 'high'] },
  { id: 'deepseek-reasoner', label: 'DeepSeek Reasoner', reasoningOptions: ['low', 'high', 'max'] },
  { id: 'fast', label: '快速', reasoningOptions: ['off'] },
];

export function reasoningShortLabel(effort: string): string {
  if (effort === 'off') {
    return '无';
  }
  if (effort === 'low') {
    return '轻';
  }
  if (effort === 'max') {
    return '高';
  }
  return '中';
}

export function formatComposerModelChip(modelId: string, effort: string): string {
  const model = PREVIEW_MODELS.find((m) => m.id === modelId);
  const label = model !== undefined ? model.label : modelId;
  return `${label} · ${reasoningShortLabel(effort)}`;
}

export function resolveModelIdFromLabel(label: string): string {
  const lower = label.toLowerCase();
  if (lower.indexOf('reasoner') >= 0) {
    return 'deepseek-reasoner';
  }
  if (label.indexOf('快速') >= 0 || lower.indexOf('fast') >= 0) {
    return 'fast';
  }
  return 'deepseek-chat';
}

export function resolveReasoningFromLabel(label: string): string {
  if (label.indexOf('Reasoner') >= 0 && label.indexOf('高') >= 0) {
    return 'max';
  }
  if (label.indexOf('高') >= 0) {
    return 'high';
  }
  if (label.indexOf('轻') >= 0) {
    return 'low';
  }
  if (label.indexOf('无') >= 0) {
    return 'off';
  }
  return 'high';
}

function coerceReasoning(modelId: string, effort: string): string {
  const model = PREVIEW_MODELS.find((m) => m.id === modelId);
  const allowed = model !== undefined ? model.reasoningOptions : ['high'];
  return allowed.indexOf(effort) >= 0 ? effort : allowed[allowed.length - 1];
}

@Component
export struct PreviewComposerModelSheet {
  @Prop visible: boolean = false;
  @Prop useDark: boolean = false;
  @Prop reduceMotion: boolean = PreviewLocalPreferences.reduceMotion;
  @Link selectedModelId: string;
  @Link reasoningEffort: string;
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

  private activeModel(): PreviewModelDef {
    const found = PREVIEW_MODELS.find((m) => m.id === this.selectedModelId);
    return found !== undefined ? found : PREVIEW_MODELS[0];
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
        .onClick(() => this.onClose())

      Column({ space: 0 }) {
        Row() {
          Column()
            .width(36)
            .height(4)
            .backgroundColor(HarnessColors.mutedText(this.useDark))
            .borderRadius(2)
        }
        .width('100%')
        .justifyContent(FlexAlign.Center)
        .padding({ top: 10, bottom: 8 })

        ForEach(PREVIEW_MODELS, (model: PreviewModelDef) => {
          Row() {
            Text(model.label)
              .fontSize(15)
              .fontColor(
                model.id === this.selectedModelId ? HarnessColors.primaryText(this.useDark) :
                  HarnessColors.secondaryText(this.useDark),
              )
              .layoutWeight(1)
            if (model.id === this.selectedModelId) {
              Text('✓')
                .fontSize(16)
                .fontColor(HarnessColors.linkText(this.useDark))
            }
          }
          .width('100%')
          .height(48)
          .padding({ left: 16, right: 16 })
          .onClick(() => {
            this.selectedModelId = model.id;
            this.reasoningEffort = coerceReasoning(model.id, this.reasoningEffort);
          })
        }, (model: PreviewModelDef) => model.id)

        Text('思考强度')
          .fontSize(12)
          .fontColor(HarnessColors.mutedText(this.useDark))
          .padding({ left: 16, top: 16, bottom: 10 })

        SlidingSegmentTrack({
          segmentCount: this.activeModel().reasoningOptions.length,
          selectedIndex: Math.max(0, this.activeModel().reasoningOptions.indexOf(this.reasoningEffort)),
          useDark: this.useDark,
        }) {
          Row({ space: 0 }) {
            ForEach(this.activeModel().reasoningOptions, (option: string) => {
              Text(reasoningShortLabel(option))
                .fontSize(12)
                .fontWeight(option === this.reasoningEffort ? FontWeight.Medium : FontWeight.Normal)
                .fontColor(
                  option === this.reasoningEffort ? HarnessColors.primaryForeground(this.useDark) :
                    HarnessColors.secondaryText(this.useDark),
                )
                .height(34)
                .layoutWeight(1)
                .textAlign(TextAlign.Center)
                .onClick(() => {
                  this.reasoningEffort = option;
                })
            }, (option: string) => option)
          }
          .width('100%')
        }
        .margin({ left: 12, right: 12 })

        Blank().height(32)
      }
      .width('100%')
      .constraintSize({ minHeight: 320 })
      .padding({ left: 8, right: 8, bottom: 32 })
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
