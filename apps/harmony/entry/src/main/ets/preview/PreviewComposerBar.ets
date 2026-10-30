import { ComposerPreviewState, FollowUpRow, ToolApprovalItemPreview } from './PreviewModels';
import { HarnessColors } from '../coreui/HarnessColors';
import { PreviewUiAction } from './PreviewSessionReducer';
import { PreviewComposerBlockKind } from './PreviewAuth';
import { ComposerBlockBanner } from './ComposerBlockBanner';
import { harnessPressOpacity } from '../coreui/HarnessPressScale';
import {
  HarnessArrowUpIcon,
  HarnessChevronDownIcon,
  HarnessCloseIcon,
  HarnessPlusIcon,
} from '../coreui/HarnessVectorIcons';

/** RN `rounded-bubble` = 22vp；control = 8vp。 */
const BUBBLE_RADIUS: number = 22;
/** 对齐 mobile-contract `composerChromeBottomExtra`（系统安全区之外的间距）。 */
const COMPOSER_CHROME_BOTTOM_EXTRA: number = 10;
const SEND_SIZE: number = 32;
const PLUS_SIZE: number = 44;
/** 约 5 行正文，对齐 Android HarnessLayout / RN max-h-24。 */
const COMPOSER_INPUT_MIN_HEIGHT: number = 44;
const COMPOSER_INPUT_MAX_HEIGHT: number = 120;
const COMPOSER_INPUT_MAX_LINES: number = 5;
const FOLLOW_UP_ROW_MIN_HEIGHT: number = 36;
const FOLLOW_UP_ACTION_SIZE: number = 28;
const ATTACHMENT_STRIP_HEIGHT: number = 52;
const ATTACHMENT_FILE_MAX_WIDTH: number = 216;

@Component
export struct PreviewComposerBar {
  var onModelClick: () => void = () => {
  };
  var onAttachClick: () => void = () => {
  };
  var onSkillClick: () => void = () => {
  };
  onPreviewAction: (action: PreviewUiAction) => void = () => {
  };
  @Prop modelLabelOverride: string = '';
  @Prop useDark: boolean = false;
  @Prop workbenchOpen: boolean = false;
  @Prop composerBlock: PreviewComposerBlockKind = PreviewComposerBlockKind.NONE;
  onLoginClick: () => void = () => {
  };
  @State expandedApprovalId: string = '';
  @State draft: string = '';
  @State clarificationAnswer: string = '';
  @State attachPressed: boolean = false;
  @State modelPressed: boolean = false;
  @State sendPressed: boolean = false;
  @Prop composer: ComposerPreviewState = {
    composerMode: 'default',
    composerTextMode: 'new-run',
    submitting: false,
    placeholder: '',
    disabled: false,
    toolApprovalTitle: '',
    toolApprovalNote: '',
    toolCommands: [],
    toolApprovalItems: [],
    followUps: [],
    showPlan: false,
    planExplanation: '',
    planSteps: [],
    modelLabel: '默认模型',
    attachmentNames: [],
    selectedSkills: [],
  };

  @Builder
  followUpQueueBlock() {
    Column() {
      ForEach(this.composer.followUps, (row: FollowUpRow, index: number) => {
        if (index > 0) {
          Divider().strokeWidth(1).color(HarnessColors.composerBorderColor(this.useDark))
        }
        Row({ space: 8 }) {
          Text('↵').fontSize(14).fontColor(HarnessColors.mutedText(this.useDark))
          Text(row.content)
            .fontSize(13)
            .lineHeight(18)
            .fontColor(HarnessColors.primaryText(this.useDark))
            .maxLines(1)
            .textOverflow({ overflow: TextOverflow.Ellipsis })
            .layoutWeight(1)
          Row({ space: 4 }) {
            Row() {
              HarnessArrowUpIcon({
                color: HarnessColors.secondaryText(this.useDark),
                size: 14,
                stroke: 2,
              })
            }
            .width(FOLLOW_UP_ACTION_SIZE)
            .height(FOLLOW_UP_ACTION_SIZE)
            .justifyContent(FlexAlign.Center)
            .borderRadius(8)
            .onClick(() => {
              this.onPreviewAction({ kind: 'sendFollowUp', id: row.id });
            })
            Row() {
              HarnessCloseIcon({
                color: HarnessColors.mutedText(this.useDark),
                size: 12,
                stroke: 2,
              })
            }
            .width(FOLLOW_UP_ACTION_SIZE)
            .height(FOLLOW_UP_ACTION_SIZE)
            .justifyContent(FlexAlign.Center)
            .onClick(() => {
              this.onPreviewAction({ kind: 'dismissFollowUp', id: row.id });
            })
          }
        }
        .width('100%')
        .height(FOLLOW_UP_ROW_MIN_HEIGHT)
        .padding({ left: 12, right: 12 })
      }, (row: FollowUpRow) => row.id)
    }
    .width('100%')
  }

  build() {
    Column({ space: 8 }) {
      ComposerBlockBanner({
        blockKind: this.composerBlock,
        useDark: this.useDark,
        onLoginClick: () => this.onLoginClick(),
      })
      Stack({ alignContent: Alignment.Bottom }) {
        Column({ space: 8 }) {
        if (this.composer.followUps.length > 0) {
          this.followUpQueueBlock()
          Divider().strokeWidth(1).color(HarnessColors.composerBorderColor(this.useDark))
        }
        if (this.composer.selectedSkills.length > 0) {
          Flex({ wrap: FlexWrap.Wrap }) {
            ForEach(this.composer.selectedSkills, (skill: string) => {
              Text(skill)
                .fontSize(12)
                .fontColor(HarnessColors.linkText(this.useDark))
                .padding({ left: 8, right: 8, top: 4, bottom: 4 })
                .margin({ right: 6, bottom: 6 })
                .backgroundColor(HarnessColors.subtleBg(this.useDark))
                .borderRadius(999)
                .border({ width: 1, color: HarnessColors.composerBorder(this.useDark) })
            }, (skill: string) => skill)
          }
          .width('100%')
        }
        if (this.composer.attachmentNames.length > 0) {
          Scroll() {
            Row({ space: 6 }) {
              ForEach(this.composer.attachmentNames, (fileName: string) => {
                this.attachmentCard(fileName)
              }, (fileName: string) => fileName)
            }
          }
          .scrollable(ScrollDirection.Horizontal)
          .scrollBar(BarState.Off)
          .width('100%')
          .height(ATTACHMENT_STRIP_HEIGHT)
        }
        if (this.composer.clarification) {
          this.clarificationBlock()
        }
        if (this.composer.toolApprovalTitle.length > 0) {
          this.toolApprovalBlock()
        }
        if (!this.composer.clarification && this.composer.toolApprovalTitle.length === 0) {
          this.defaultComposerBlock()
        }
        }
        .width('100%')
        .padding({ left: 12, right: 12, top: 10, bottom: 10 })
        .backgroundColor(HarnessColors.surface(this.useDark))
        .border({ width: 1, color: HarnessColors.composerBorderColor(this.useDark) })
        .borderRadius(BUBBLE_RADIUS)
      }
      .width('100%')
    }
    .width('100%')
    .padding({ left: 12, right: 12, top: 4, bottom: 8 + COMPOSER_CHROME_BOTTOM_EXTRA })
    .backgroundColor(HarnessColors.canvas(this.useDark))
  }

  @Builder
  defaultComposerBlock() {
    TextArea({
      placeholder: this.composer.placeholder,
      text: this.draft,
    })
      .width('100%')
      .fontSize(14)
      .lineHeight(22)
      .maxLines(COMPOSER_INPUT_MAX_LINES)
      .constraintSize({
        minHeight: COMPOSER_INPUT_MIN_HEIGHT,
        maxHeight: COMPOSER_INPUT_MAX_HEIGHT,
      })
      .backgroundColor(Color.Transparent)
      .fontColor(HarnessColors.primaryText(this.useDark))
      .enabled(this.inputEnabled())
      .onChange((v: string) => {
        this.draft = v;
      })
    Row({ space: 8 }) {
      Row() {
        HarnessPlusIcon({ color: HarnessColors.primaryText(this.useDark), size: 20 })
      }
      .width(PLUS_SIZE)
      .height(PLUS_SIZE)
      .justifyContent(FlexAlign.Center)
      .borderRadius(8)
        .opacity(harnessPressOpacity(this.attachPressed, this.inputEnabled()))
        .onTouch((event: TouchEvent) => {
          if (event.type === TouchType.Down) {
            this.attachPressed = true;
          }
          if (event.type === TouchType.Up || event.type === TouchType.Cancel) {
            this.attachPressed = false;
          }
        })
        .onClick(() => this.onAttachClick())
      Blank().layoutWeight(1)
      if (this.composer.composerTextMode !== 'clarification') {
        Row({ space: 2 }) {
          Text(this.modelLabelOverride.length > 0 ? this.modelLabelOverride : this.composer.modelLabel)
            .fontSize(12)
            .fontColor(HarnessColors.secondaryText(this.useDark))
            .maxLines(1)
            .textOverflow({ overflow: TextOverflow.Ellipsis })
          HarnessChevronDownIcon({
            color: HarnessColors.mutedText(this.useDark),
            size: 12,
            stroke: 2,
          })
        }
        .height(PLUS_SIZE)
        .padding({ left: 8, right: 8 })
        .borderRadius(8)
        .opacity(harnessPressOpacity(this.modelPressed, this.inputEnabled()))
        .onTouch((event: TouchEvent) => {
          if (event.type === TouchType.Down) {
            this.modelPressed = true;
          }
          if (event.type === TouchType.Up || event.type === TouchType.Cancel) {
            this.modelPressed = false;
          }
        })
        .onClick(() => this.onModelClick())
      }
      Stack({ alignContent: Alignment.Center }) {
        HarnessArrowUpIcon({
          color: this.sendPressEnabled() ? HarnessColors.primaryForeground(this.useDark) :
            HarnessColors.mutedText(this.useDark),
          size: 16,
          stroke: 2.5,
        })
      }
      .width(SEND_SIZE)
      .height(SEND_SIZE)
      .backgroundColor(this.sendPressEnabled() ? HarnessColors.primaryText(this.useDark) :
        HarnessColors.subtleBg(this.useDark))
      .borderRadius(SEND_SIZE / 2)
      .opacity(harnessPressOpacity(this.sendPressed, this.sendPressEnabled()))
      .onTouch((event: TouchEvent) => {
        if (event.type === TouchType.Down) {
          this.sendPressed = true;
        }
        if (event.type === TouchType.Up || event.type === TouchType.Cancel) {
          this.sendPressed = false;
        }
      })
      .onClick(() => {
        if (this.composer.submitting && this.draft.trim().length === 0) {
          this.onPreviewAction({ kind: 'stopRun' });
        } else if (this.sendEnabled()) {
          this.onPreviewAction({ kind: 'sendText', text: this.draft });
          this.draft = '';
        }
      })
    }
    .width('100%')
    .alignItems(VerticalAlign.Center)
  }

  @Builder
  clarificationBlock() {
    Column({ space: 10 }) {
      Row() {
        Text(this.composer.clarification!.question)
          .fontSize(15)
          .fontColor(HarnessColors.secondaryText(this.useDark))
          .layoutWeight(1)
        Text('取消')
          .fontSize(13)
          .fontColor(HarnessColors.mutedText(this.useDark))
          .onClick(() => this.onPreviewAction({ kind: 'cancelRun' }))
      }
      .width('100%')
      .alignItems(VerticalAlign.Top)

      Flex({ wrap: FlexWrap.Wrap, space: { main: 8, cross: 8 } }) {
        ForEach(this.composer.clarification!.options, (opt: string) => {
          Text(opt)
            .fontSize(13)
            .fontColor(HarnessColors.secondaryText(this.useDark))
            .padding({ left: 12, right: 12, top: 8, bottom: 8 })
            .backgroundColor(HarnessColors.subtleBg(this.useDark))
            .borderRadius(999)
            .onClick(() => {
              this.onPreviewAction({ kind: 'submitClarification', text: opt });
            })
        }, (opt: string) => opt)
      }
      .width('100%')

      if (this.composer.clarification!.allowFreeText) {
        Row({ space: 8 }) {
          TextInput({ placeholder: '其他…', text: this.clarificationAnswer })
            .layoutWeight(1)
            .height(40)
            .fontSize(14)
            .fontColor(HarnessColors.primaryText(this.useDark))
            .placeholderColor(HarnessColors.mutedText(this.useDark))
            .backgroundColor(HarnessColors.subtleBg(this.useDark))
            .borderRadius(8)
            .padding({ left: 12, right: 12 })
            .onChange((v: string) => {
              this.clarificationAnswer = v;
            })
          Text('提交')
            .fontSize(14)
            .fontColor(
              this.clarificationAnswer.trim().length > 0
                ? HarnessColors.linkText(this.useDark)
                : HarnessColors.mutedText(this.useDark),
            )
            .onClick(() => {
              const t = this.clarificationAnswer.trim();
              if (t.length > 0) {
                this.onPreviewAction({ kind: 'submitClarification', text: t });
                this.clarificationAnswer = '';
              }
            })
        }
        .width('100%')
        .alignItems(VerticalAlign.Center)
      }
    }
    .width('100%')
  }

  @Builder
  toolApprovalBlock() {
    Column({ space: 6 }) {
      Text(this.composer.toolApprovalTitle)
        .fontSize(14)
        .fontWeight(FontWeight.Medium)
        .fontColor(HarnessColors.primaryText(this.useDark))
      if (this.composer.toolApprovalNote.length > 0) {
        Text(this.composer.toolApprovalNote)
          .fontSize(12)
          .fontColor(HarnessColors.secondaryText(this.useDark))
      }
      if (this.composer.toolApprovalItems.length > 0) {
        ForEach(this.composer.toolApprovalItems, (item: ToolApprovalItemPreview) => {
          Column({ space: 4 }) {
            Row() {
              Text(item.toolName).fontSize(13).fontWeight(FontWeight.Medium).layoutWeight(1)
              Text(this.expandedApprovalId === item.itemId ? '收起' : '展开')
                .fontSize(12)
                .fontColor(HarnessColors.linkText(this.useDark))
                .onClick(() => {
                  this.expandedApprovalId =
                    this.expandedApprovalId === item.itemId ? '' : item.itemId;
                })
            }
            .width('100%')
            if (this.expandedApprovalId === item.itemId) {
              Text(item.command)
                .fontSize(12)
                .fontFamily('monospace')
                .width('100%')
            }
          }
          .width('100%')
          .padding(8)
          .backgroundColor(HarnessColors.subtleBg(this.useDark))
          .borderRadius(8)
        }, (item: ToolApprovalItemPreview) => item.itemId)
      }
      Row({ space: 12 }) {
        Text('拒绝').fontSize(14).layoutWeight(1).textAlign(TextAlign.Center).padding(10)
          .fontColor(HarnessColors.primaryText(this.useDark))
          .backgroundColor(HarnessColors.subtleBg(this.useDark)).borderRadius(8)
          .onClick(() => {
            this.onPreviewAction({ kind: 'rejectTools' });
          })
        Text('批准执行').fontSize(14).layoutWeight(1).textAlign(TextAlign.Center).padding(10)
          .backgroundColor(HarnessColors.primaryText(this.useDark))
          .fontColor(HarnessColors.primaryForeground(this.useDark))
          .borderRadius(8)
          .onClick(() => {
            this.onPreviewAction({ kind: 'approveTools' });
          })
      }
      .width('100%')
    }
    .width('100%')
  }

  sendEnabled(): boolean {
    return this.inputEnabled() && this.draft.trim().length > 0;
  }

  sendPressEnabled(): boolean {
    return this.inputEnabled() && (this.draft.trim().length > 0 || this.composer.submitting);
  }

  inputEnabled(): boolean {
    if (this.composerBlock !== PreviewComposerBlockKind.NONE) {
      return false;
    }
    if (this.composer.disabled) {
      return false;
    }
    if (this.composer.toolApprovalTitle.length > 0) {
      return false;
    }
    return this.composer.composerTextMode !== 'disabled';
  }

  isImageFile(fileName: string): boolean {
    const lower = fileName.toLowerCase();
    return lower.endsWith('.png') || lower.endsWith('.jpg') || lower.endsWith('.jpeg') ||
      lower.endsWith('.webp');
  }

  @Builder
  attachmentCard(fileName: string) {
    if (this.isImageFile(fileName)) {
      Text('IMG')
        .fontSize(10)
        .fontColor(HarnessColors.mutedText(this.useDark))
        .width(ATTACHMENT_STRIP_HEIGHT)
        .height(ATTACHMENT_STRIP_HEIGHT)
        .textAlign(TextAlign.Center)
        .backgroundColor(HarnessColors.subtleBg(this.useDark))
        .borderRadius(8)
        .border({ width: 1, color: HarnessColors.composerBorder(this.useDark) })
    } else {
      Row({ space: 8 }) {
        Text(this.fileExtLabel(fileName))
          .fontSize(9)
          .fontWeight(FontWeight.Bold)
          .fontColor(HarnessColors.linkText(this.useDark))
          .width(32)
          .height(32)
          .textAlign(TextAlign.Center)
          .backgroundColor(HarnessColors.canvas(this.useDark))
          .borderRadius(4)
        Text(fileName)
          .fontSize(13)
          .fontWeight(FontWeight.Medium)
          .fontColor(HarnessColors.primaryText(this.useDark))
          .maxLines(1)
          .textOverflow({ overflow: TextOverflow.Ellipsis })
          .layoutWeight(1)
        HarnessCloseIcon({
          color: HarnessColors.mutedText(this.useDark),
          size: 12,
          stroke: 2,
        })
      }
      .height(ATTACHMENT_STRIP_HEIGHT)
      .width(ATTACHMENT_FILE_MAX_WIDTH)
      .padding({ left: 8, right: 8 })
      .backgroundColor(HarnessColors.subtleBg(this.useDark))
      .borderRadius(8)
      .border({ width: 1, color: HarnessColors.composerBorder(this.useDark) })
    }
  }

  fileExtLabel(fileName: string): string {
    const dot = fileName.lastIndexOf('.');
    if (dot < 0 || dot === fileName.length - 1) {
      return 'FILE';
    }
    return fileName.substring(dot + 1).toUpperCase().substring(0, 4);
  }
}
