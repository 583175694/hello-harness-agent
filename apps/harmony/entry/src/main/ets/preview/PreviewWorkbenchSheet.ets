import { HarnessColors } from '../coreui/HarnessColors';
import { PreviewMarkdownText } from '../coreui/PreviewMarkdownText';
import {
  ArtifactVersionRow,
  WorkbenchActivityRow,
  WorkbenchDeliverableFileRow,
  WorkbenchPreviewState,
  WorkbenchSourceItem,
  WorkbenchToolExecutionRow,
} from './PreviewModels';
import { PreviewLocalPreferences } from './PreviewLocalPreferences';
// Gate A: activity 内 relatedSources / WorkbenchSourceCard；deliverableFiles / previewMarkdown 文件预览。
import { WorkbenchSegmentedTabs } from './WorkbenchSegmentedTabs';

const WB_DETENT_HEIGHTS: string[] = ['44%', '72%', '98%'];
/** 对齐 Web `.workbench-tool-slider` / Android HarnessLayout。 */
const WORKBENCH_STEP_FOOTER_TOP_PADDING: number = 12;
const WORKBENCH_STEP_FOOTER_HORIZONTAL_PADDING: number = 16;
const WORKBENCH_STEP_FOOTER_BOTTOM_PADDING: number = 14;
const WORKBENCH_STEP_FOOTER_CONTENT_GAP: number = 8;
const WORKBENCH_STEP_ICON_SIZE: number = 40;

@Component
export struct PreviewWorkbenchSheet {
  @Prop state: WorkbenchPreviewState = {
    initialView: 'activity',
    initialSheetIndex: 2,
    workbenchCount: 0,
    reportMarkdown: '',
    contextJsonPreview: '',
    artifactDiffPreview: '',
    artifactRestorePrompt: '',
    sources: [],
    artifactVersions: [],
    activityTimeline: [],
    toolExecutions: [],
    deliverableFiles: [],
    bashSnippet: '',
    sourcesRetrievalOnly: false,
  };
  @Link visible: boolean;
  /** fixture 切换时重置 Tab/detent；Replay 刷新父组件时不重置（UI 回归 #4）。 */
  @Prop sessionKey: string = '';
  @Prop initialFocusedToolId: string = '';
  @Prop reduceMotion: boolean = PreviewLocalPreferences.reduceMotion;
  @Prop useDark: boolean = PreviewLocalPreferences.themeDark;
  onOpenReader: (title: string, body: string, isArtifact: boolean) => void = () => {
  };

  @State activeTab: string = 'activity';
  @State detentIndex: number = 2;
  @State passageTitle: string = '';
  @State passageHeading: string = '';
  @State passageBody: string = '';
  @State passageOpen: boolean = false;
  /** 0=收起，1=完全展开；与 Android sheetProgress 对齐（280ms） */
  @State presentProgress: number = 0;
  @State stepIndex: number = 0;
  private lastSessionKey: string = '';

  @Watch('visible')
  onVisibleChange(): void {
    this.presentProgress = this.visible ? 1 : 0;
    if (this.visible) {
      this.applyFocusedToolStep();
    }
  }

  @Watch('initialFocusedToolId')
  onFocusedToolChange(): void {
    this.applyFocusedToolStep();
  }

  private applyFocusedToolStep(): void {
    if (this.initialFocusedToolId.length === 0) {
      return;
    }
    const executions = this.state.toolExecutions;
    for (let i = 0; i < executions.length; i++) {
      if (executions[i].id === this.initialFocusedToolId) {
        this.stepIndex = i;
        this.activeTab = 'activity';
        return;
      }
    }
  }

  private sheetSlideOffsetVp(): number {
    return (1 - this.presentProgress) * 1000;
  }

  private resolvedInitialDetent(): number {
    const emptyShell =
      this.state.workbenchCount === 0 &&
        this.state.toolExecutions.length === 0 &&
        this.state.activityTimeline.length === 0 &&
        this.state.bashSnippet.trim().length === 0 &&
        this.state.sources.length === 0 &&
        this.state.deliverableFiles.length === 0 &&
        this.state.artifactVersions.length === 0;
    if (emptyShell) {
      return 1;
    }
    return Math.min(2, Math.max(0, this.state.initialSheetIndex));
  }

  private syncFromState(): void {
    this.activeTab = this.state.initialView.length > 0 ? this.state.initialView : 'activity';
    this.detentIndex = this.resolvedInitialDetent();
  }

  aboutToAppear(): void {
    this.lastSessionKey = this.sessionKey;
    this.syncFromState();
  }

  aboutToUpdate(): void {
    if (this.sessionKey.length > 0 && this.sessionKey !== this.lastSessionKey) {
      this.lastSessionKey = this.sessionKey;
      this.syncFromState();
    }
  }

  visibleTabs(): string[] {
    const all: string[] = ['activity', 'artifact'];
    const showArtifact = this.state.workbenchCount > 0 || this.state.deliverableFiles.length > 0 ||
      this.state.artifactVersions.length > 0 ||
      this.state.artifactDiffPreview.length > 0;
    return all.filter((t: string) => t !== 'artifact' || showArtifact);
  }

  @Builder
  stepNavButton(label: string, enabled: boolean, onStep: () => void) {
    Row() {
      Text(label === '上一步' ? '‹' : '›')
        .fontSize(20)
        .fontWeight(FontWeight.Medium)
        .fontColor(
          enabled ? HarnessColors.primaryText(this.useDark) : HarnessColors.mutedText(this.useDark),
        )
    }
    .width(WORKBENCH_STEP_ICON_SIZE)
    .height(WORKBENCH_STEP_ICON_SIZE)
    .justifyContent(FlexAlign.Center)
    .opacity(enabled ? 1 : 0.38)
    .accessibilityText(label)
    .onClick(() => {
      if (enabled) {
        onStep();
      }
    })
  }

  relatedSources(tool: WorkbenchToolExecutionRow): WorkbenchSourceItem[] {
    if (tool.linkedSourceIndexes.length > 0) {
      return tool.linkedSourceIndexes
        .map((i: number) => this.state.sources[i])
        .filter((s: WorkbenchSourceItem | undefined) => s !== undefined) as WorkbenchSourceItem[];
    }
    if (tool.toolName === 'web_search' || tool.toolName === 'web_fetch') {
      return this.state.sources;
    }
    return [];
  }

  @Builder
  activityTabContent() {
    const executions = this.state.toolExecutions;
    if (executions.length === 0) {
      Column({ space: 8 }) {
        Text('暂无过程记录')
          .fontSize(15)
          .fontWeight(FontWeight.Medium)
          .fontColor(HarnessColors.primaryText(this.useDark))
        Text('助手的检索、读取与命令执行会显示在这里。')
          .fontSize(12)
          .fontColor(HarnessColors.mutedText(this.useDark))
          .textAlign(TextAlign.Center)
      }
      .width('100%')
      .padding({ left: 16, right: 16, top: 48, bottom: 48 })
    } else {
      const idx = Math.min(Math.max(this.stepIndex, 0), executions.length - 1);
      const tool = executions[idx];
      const sources = this.relatedSources(tool);
      Column() {
        Scroll() {
          Column({ space: 10 }) {
            Row() {
              Text(tool.title.length > 0 ? tool.title : tool.toolName)
                .fontSize(16)
                .fontWeight(FontWeight.Medium)
                .fontColor(HarnessColors.primaryText(this.useDark))
                .layoutWeight(1)
              if (tool.elapsed.length > 0) {
                Text(tool.elapsed).fontSize(11).fontColor(HarnessColors.mutedText(this.useDark))
              }
            }
            .width('100%')
            Text(tool.toolName).fontSize(12).fontColor(HarnessColors.mutedText(this.useDark))
            if (tool.inputSummary.length > 0) {
              Text('输入').fontSize(11).fontColor(HarnessColors.mutedText(this.useDark))
              Text(tool.inputSummary)
                .fontSize(13)
                .padding(12)
                .width('100%')
                .backgroundColor(HarnessColors.subtleBg(this.useDark))
                .borderRadius(12)
            }
            Text(
              tool.bashOutput.length > 0 ? tool.bashOutput :
                (tool.outputSummary.length > 0 ? tool.outputSummary :
                  (tool.detail.length > 0 ? tool.detail : '执行中，结果尚未生成')),
            )
              .fontSize(12)
              .fontFamily(tool.toolName === 'bash' ? 'monospace' : 'default')
              .padding(12)
              .width('100%')
              .backgroundColor(
                tool.toolName === 'bash' ? HarnessColors.terminalBackground(this.useDark) :
                  HarnessColors.subtleBg(this.useDark),
              )
              .borderRadius(12)
            if (sources.length > 0) {
              Text('关联来源').fontSize(11).fontColor(HarnessColors.mutedText(this.useDark))
              ForEach(sources, (src: WorkbenchSourceItem) => {
                Column({ space: 4 }) {
                  Text(src.title).fontSize(13).fontColor(HarnessColors.primaryText(this.useDark))
                  Text(src.url).fontSize(11).fontColor(HarnessColors.linkText(this.useDark))
                  if (src.snippet.length > 0) {
                    Text(src.snippet).fontSize(11).fontColor(HarnessColors.mutedText(this.useDark))
                  }
                }
                .width('100%')
                .padding(12)
                .borderRadius(12)
                .border({ width: 1, color: HarnessColors.composerBorder(this.useDark) })
              }, (src: WorkbenchSourceItem) => src.url + src.title)
            }
          }
          .padding(16)
        }
        .layoutWeight(1)
        .scrollBar(BarState.Auto)

        Divider()
          .strokeWidth(1)
          .color(HarnessColors.composerBorder(this.useDark))
        Column({ space: WORKBENCH_STEP_FOOTER_CONTENT_GAP }) {
          Text(`步骤 ${idx + 1} / ${executions.length}`)
            .fontSize(11)
            .fontColor(HarnessColors.mutedText(this.useDark))
            .fontFeatureSettings('"tnum" 1')
          Row({ space: WORKBENCH_STEP_FOOTER_CONTENT_GAP }) {
            this.stepNavButton('上一步', this.stepIndex > 0, () => {
              this.stepIndex -= 1;
            })
            Slider({
              value: idx,
              min: 0,
              max: executions.length - 1,
              step: 1,
              style: SliderStyle.OutSet,
            })
              .layoutWeight(1)
              .height(48)
              .trackColor(HarnessColors.composerBorderColor(this.useDark))
              .selectedColor(HarnessColors.primaryText(this.useDark))
              .blockColor(HarnessColors.surface(this.useDark))
              .blockBorderColor(HarnessColors.primaryText(this.useDark))
              .blockBorderWidth(2)
              .showSteps(false)
              .accessibilityText(`步骤 ${idx + 1}，共 ${executions.length}`)
              .onChange((v: number) => {
                this.stepIndex = Math.round(v);
              })
            this.stepNavButton('下一步', idx < executions.length - 1, () => {
              this.stepIndex += 1;
            })
          }
          .width('100%')
        }
        .width('100%')
        .backgroundColor(HarnessColors.surface(this.useDark))
        .padding({
          top: WORKBENCH_STEP_FOOTER_TOP_PADDING,
          left: WORKBENCH_STEP_FOOTER_HORIZONTAL_PADDING,
          right: WORKBENCH_STEP_FOOTER_HORIZONTAL_PADDING,
          bottom: WORKBENCH_STEP_FOOTER_BOTTOM_PADDING,
        })
      }
      .width('100%')
      .layoutWeight(1)
    }
  }

  @Builder
  filesTabContent() {
    if (this.state.deliverableFiles.length === 0) {
      Text('暂无文件').fontSize(14).fontColor(HarnessColors.mutedText(this.useDark)).padding(24)
    } else {
      ForEach(this.state.deliverableFiles, (file: WorkbenchDeliverableFileRow) => {
        Row() {
          Column({ space: 2 }) {
            Text(file.fileName).fontSize(14).fontColor(HarnessColors.primaryText(this.useDark))
            if (file.subtitle.length > 0) {
              Text(file.subtitle).fontSize(11).fontColor(HarnessColors.mutedText(this.useDark))
            }
          }
          .layoutWeight(1)
          Text('预览')
            .fontSize(13)
            .fontColor(HarnessColors.linkText(this.useDark))
            .onClick(() => {
              const md = file.previewMarkdown.length > 0 ? file.previewMarkdown :
                `# ${file.fileName}\n\n（Preview 文件预览）`;
              this.onOpenReader(file.fileName, md, false);
            })
        }
        .width('100%')
        .padding({ left: 14, right: 14, top: 12, bottom: 12 })
        .borderRadius(12)
        .border({ width: 1, color: HarnessColors.composerBorder(this.useDark) })
        .margin({ bottom: 10 })
      }, (file: WorkbenchDeliverableFileRow) => file.id)
    }
  }

  /** 低档对齐 Android overlayScrimAlpha 0.4；最高档加深（UI 回归 #5） */
  scrimAlpha(): string {
    const high = this.detentIndex >= 2;
    if (this.reduceMotion) {
      return high ? '#000000CC' : '#00000066';
    }
    return high ? '#00000088' : '#00000066';
  }

  build() {
    if (!this.visible && this.presentProgress <= 0.01) {
      Blank();
      return;
    }
    Stack() {
      Stack({ alignContent: Alignment.Bottom }) {
        Column()
          .width('100%')
          .height('100%')
          .backgroundColor(this.scrimAlpha())
          .opacity(this.presentProgress)
          .animation({
            duration: this.reduceMotion ? 0 : 280,
            curve: Curve.EaseOut,
          })
          .onClick(() => {
            this.visible = false;
          })

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
          .padding({ top: 8 })
          .onClick(() => {
            this.detentIndex = (this.detentIndex + 1) % WB_DETENT_HEIGHTS.length;
          })

          Row() {
            Text('工作台').fontSize(16).fontWeight(FontWeight.Medium).layoutWeight(1)
              .fontColor(HarnessColors.primaryText(this.useDark))
            Text(`${this.detentIndex + 1}/3`).fontSize(11).fontColor(HarnessColors.mutedText(this.useDark))
            Text('完成')
              .fontSize(14)
              .fontWeight(FontWeight.Medium)
              .fontColor(HarnessColors.linkText(this.useDark))
              .margin({ left: 12 })
              .onClick(() => {
                this.visible = false;
              })
          }
          .width('100%')
          .padding({ left: 12, right: 12 })

          WorkbenchSegmentedTabs({
            tabs: this.visibleTabs(),
            activeTab: this.activeTab,
            useDark: this.useDark,
            onTabChange: (tab: string) => {
              this.activeTab = tab;
            },
          })

          if (this.activeTab === 'activity') {
            Column() {
              this.activityTabContent()
            }
            .layoutWeight(1)
            .width('100%')
          } else {
            Scroll() {
              Column({ space: 8 }) {
                this.filesTabContent()
              }
              .padding({ left: 16, right: 16, top: 8 })
            }
            .layoutWeight(1)
            .scrollBar(BarState.Auto)
            .edgeEffect(EdgeEffect.Spring)
          }
        }
        .width('100%')
        .height(WB_DETENT_HEIGHTS[this.detentIndex])
        .backgroundColor(HarnessColors.canvas(this.useDark))
        .borderRadius({ topLeft: 20, topRight: 20 })
        .border({ width: { top: 1 }, color: HarnessColors.composerBorderColor(this.useDark) })
        .translate({ y: this.sheetSlideOffsetVp() })
        .opacity(this.presentProgress)
        .animation({
          duration: this.reduceMotion ? 0 : 280,
          curve: Curve.EaseOut,
        })
        .safeAreaPadding([SafeAreaType.SYSTEM], [SafeAreaEdge.BOTTOM])
      }
      .width('100%')
      .height('100%')

      if (this.passageOpen) {
        Stack({ alignContent: Alignment.Bottom }) {
          Column()
            .width('100%')
            .height('100%')
            .backgroundColor('#00000066')
            .onClick(() => {
              this.passageOpen = false;
            })
          Column({ space: 8 }) {
            Row() {
              Text(this.passageTitle).fontSize(16).fontWeight(FontWeight.Medium).fontColor(HarnessColors.primaryText(this.useDark))
                .layoutWeight(1)
              Text('完成')
                .fontSize(14)
                .fontWeight(FontWeight.Medium)
                .fontColor(HarnessColors.linkText(this.useDark))
                .onClick(() => {
                  this.passageOpen = false;
                })
            }.width('100%')
            if (this.passageHeading.length > 0) {
              Text(this.passageHeading).fontSize(12).fontColor(HarnessColors.mutedText(this.useDark))
            }
            Scroll() {
              Text(this.passageBody)
                .fontSize(14)
                .fontColor(HarnessColors.primaryText(this.useDark))
                .width('100%')
            }
            .layoutWeight(1)
            .scrollBar(BarState.Off)
          }
          .width('100%')
          .height('50%')
          .padding(16)
          .backgroundColor(HarnessColors.surface(this.useDark))
          .borderRadius({ topLeft: 20, topRight: 20 })
          .border({ width: { top: 1 }, color: HarnessColors.composerBorderColor(this.useDark) })
        }
        .width('100%')
        .height('100%')
      }
    }
    .width('100%')
    .height('100%')
  }
}
