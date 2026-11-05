import { HarnessColors } from '../coreui/HarnessColors';
import { HarnessLayout } from '../coreui/HarnessLayout';
import { ChatMarkdown } from '../coreui/ChatMarkdown';
import { StreamingChatMarkdown } from '../coreui/StreamingChatMarkdown';
import { PreviewLocalPreferences } from './PreviewLocalPreferences';
import { ArtifactCardRow, ChatLine, UserAttachmentRow } from './PreviewModels';
import { AssistantProcessTimeline } from './ProcessTimeline';
import { HarnessAgentHttp } from '../core/HarnessAgentHttp';
import { image } from '@kit.ImageKit';

/** Pattern：UserMessageBubble */
@Component
export struct UserMessageBubble {
  @Prop text: string = '';
  @Prop attachments: UserAttachmentRow[] = [];
  @Prop fontSize: number = PreviewLocalPreferences.contentFontSize;
  @Prop useDark: boolean = false;

  private imageAttachments(): UserAttachmentRow[] {
    return this.attachments.filter((item: UserAttachmentRow) => isImageAttachment(item));
  }

  private fileAttachments(): UserAttachmentRow[] {
    return this.attachments.filter((item: UserAttachmentRow) => !isImageAttachment(item));
  }

  build() {
    Row() {
      Blank().layoutWeight(1)
      Column({ space: 8 }) {
        if (this.attachments.length > 0) {
          Column({ space: 8 }) {
            if (this.imageAttachments().length > 0) {
              Row({ space: 8 }) {
                ForEach(this.imageAttachments(), (item: UserAttachmentRow) => {
                  UserAttachmentThumbnail({ item, useDark: this.useDark })
                }, (item: UserAttachmentRow) => item.fileId.length > 0 ? item.fileId : item.fileName)
              }
            }
            ForEach(this.fileAttachments(), (item: UserAttachmentRow) => {
              Row({ space: 8 }) {
                Text(fileExtensionLabel(item.fileName))
                  .fontSize(9)
                  .fontWeight(FontWeight.Bold)
                  .fontColor(HarnessColors.linkText(this.useDark))
                  .width(28)
                  .height(28)
                  .textAlign(TextAlign.Center)
                  .backgroundColor(HarnessColors.canvas(this.useDark))
                  .borderRadius(4)
                Text(item.fileName)
                  .fontSize(13)
                  .fontColor(HarnessColors.primaryText(this.useDark))
                  .maxLines(1)
                  .textOverflow({ overflow: TextOverflow.Ellipsis })
              }
              .padding({ left: 8, right: 8, top: 6, bottom: 6 })
              .backgroundColor(HarnessColors.surface(this.useDark))
              .borderRadius(8)
            }, (item: UserAttachmentRow) => item.fileId.length > 0 ? item.fileId : item.fileName)
          }
          .alignItems(HorizontalAlign.End)
        }
        if (this.text.trim().length > 0) {
          ChatMarkdown({ markdown: this.text, fontSize: this.fontSize, useDark: this.useDark, compact: true })
        }
      }
      .padding({
        left: HarnessLayout.CHAT_BUBBLE_PADDING_HORIZONTAL,
        right: HarnessLayout.CHAT_BUBBLE_PADDING_HORIZONTAL,
        top: HarnessLayout.CHAT_BUBBLE_PADDING_VERTICAL,
        bottom: HarnessLayout.CHAT_BUBBLE_PADDING_VERTICAL,
      })
      .backgroundColor(HarnessColors.userBubbleBg(this.useDark))
      .borderRadius(HarnessLayout.BUBBLE_RADIUS)
      .constraintSize({ maxWidth: '82%' })
      .alignItems(HorizontalAlign.End)
    }
    .width('100%')
    .padding({ top: HarnessLayout.CHAT_TURN_VERTICAL_PADDING, bottom: HarnessLayout.CHAT_TURN_VERTICAL_PADDING })
  }
}

/** Pattern：AssistantTurnContent（Process + 流式/Markdown/纯文本） */
@Component
export struct AssistantTurnContent {
  @Prop line: ChatLine = { role: 'assistant', text: '', process: [] };
  @Prop streaming: boolean = false;
  @Prop fontSize: number = PreviewLocalPreferences.contentFontSize;
  @Prop useDark: boolean = false;
  @Prop reduceMotion: boolean = PreviewLocalPreferences.reduceMotion;
  onOpenWorkbenchStep: (toolCallId: string) => void = () => {
  };
  onOpenArtifact: (artifact: ArtifactCardRow) => void = () => {
  };

  private hasProcess(): boolean {
    return this.line.process.length > 0;
  }

  private trimmedPending(): string {
    const raw = this.line.pendingText ?? '';
    return raw.trim();
  }

  private trimmedFinal(): string {
    const raw = this.line.finalText ?? '';
    return raw.trim();
  }

  private hasVisibleOutput(): boolean {
    return this.trimmedPending().length > 0 || this.trimmedFinal().length > 0;
  }

  private deliveryExtraTop(): number {
    return this.hasProcess() ? HarnessLayout.CHAT_ASSISTANT_DELIVERY_EXTRA_TOP : 0;
  }

  private finalOutputVisible(): boolean {
    return this.hasVisibleOutput() || (!this.streaming && this.line.text.length > 0);
  }

  @Builder
  deliveryBlocks(followsProcess: boolean, pending: string, finalPart: string) {
    if (pending.length > 0) {
      StreamingChatMarkdown({
        markdown: pending,
        fontSize: this.fontSize,
        useDark: this.useDark,
        followsProcessTimeline: followsProcess && finalPart.length === 0,
      })
        .width('100%')
    }
    if (finalPart.length > 0) {
      StreamingChatMarkdown({
        markdown: finalPart,
        fontSize: this.fontSize,
        useDark: this.useDark,
        followsProcessTimeline: followsProcess && pending.length === 0,
      })
        .width('100%')
    }
  }

  build() {
    Column({ space: HarnessLayout.CHAT_ASSISTANT_SECTION_GAP }) {
      if (this.hasProcess() || this.streaming) {
        AssistantProcessTimeline({
          blocks: this.line.process,
          running: this.streaming,
          finalOutputVisible: this.finalOutputVisible(),
          useDark: this.useDark,
          reduceMotion: this.reduceMotion,
          onOpenWorkbench: this.onOpenWorkbenchStep,
        })
      }
      if (this.streaming) {
        if (this.hasVisibleOutput()) {
          Column({ space: HarnessLayout.CHAT_ASSISTANT_SECTION_GAP }) {
            this.deliveryBlocks(this.hasProcess(), this.trimmedPending(), this.trimmedFinal())
          }
          .width('100%')
          .padding({ top: this.deliveryExtraTop() })
        } else if (this.line.process.length === 0) {
          Text('正在思考')
            .fontSize(this.fontSize)
            .fontColor(HarnessColors.secondaryText(this.useDark))
            .width('100%')
        }
      } else {
        Column({ space: HarnessLayout.CHAT_ASSISTANT_SECTION_GAP }) {
          ChatMarkdown({
            markdown: this.line.text,
            fontSize: this.fontSize,
            useDark: this.useDark,
            followsProcessTimeline: this.hasProcess(),
          })
            .width('100%')
        }
        .width('100%')
        .padding({ top: this.deliveryExtraTop() })
      }
      if (this.line.artifacts !== undefined && this.line.artifacts.length > 0) {
        Column({ space: 8 }) {
          ForEach(this.line.artifacts, (artifact: ArtifactCardRow) => {
            ArtifactCard({ artifact: artifact, useDark: this.useDark, onOpen: this.onOpenArtifact })
          }, (artifact: ArtifactCardRow) => artifact.artifactId)
        }
        .width('100%')
      }
    }
    .width('100%')
    .padding({
      top: HarnessLayout.CHAT_TURN_VERTICAL_PADDING,
      bottom: HarnessLayout.CHAT_TURN_VERTICAL_PADDING,
    })
    .alignItems(HorizontalAlign.Start)
  }
}

/** Pattern：ConversationTurnRow */
@Component
export struct ConversationTurnRow {
  @Prop line: ChatLine = { role: 'user', text: '', process: [] };
  @Prop streamingTail: boolean = false;
  @Prop fontSize: number = PreviewLocalPreferences.contentFontSize;
  @Prop useDark: boolean = false;
  @Prop reduceMotion: boolean = PreviewLocalPreferences.reduceMotion;
  onOpenWorkbenchStep: (toolCallId: string) => void = () => {
  };
  onOpenArtifact: (artifact: ArtifactCardRow) => void = () => {
  };

  build() {
    if (this.line.role === 'user') {
      UserMessageBubble({
        text: this.line.text,
        attachments: this.line.attachments ?? [],
        fontSize: this.fontSize,
        useDark: this.useDark,
      })
    } else {
      AssistantTurnContent({
        line: this.line,
        streaming: this.streamingTail,
        fontSize: this.fontSize,
        useDark: this.useDark,
        reduceMotion: this.reduceMotion,
        onOpenWorkbenchStep: this.onOpenWorkbenchStep,
        onOpenArtifact: this.onOpenArtifact,
      })
    }
  }
}

@Component
struct UserAttachmentThumbnail {
  @Prop item: UserAttachmentRow = { fileId: '', fileName: '', mediaType: '' };
  @Prop useDark: boolean = false;
  @State pixelMap: image.PixelMap | undefined = undefined;
  @State failed: boolean = false;

  aboutToAppear(): void {
    if (this.item.fileId.length === 0) {
      return;
    }
    void this.loadThumbnail();
  }

  private async loadThumbnail(): Promise<void> {
    try {
      const content = await HarnessAgentHttp.getBinary(`/api/agent/files/${this.item.fileId}/preview`);
      if (content.data.byteLength === 0) {
        this.failed = true;
        return;
      }
      const source = image.createImageSource(content.data);
      this.pixelMap = await source.createPixelMap();
      source.release();
    } catch (_e) {
      this.failed = true;
    }
  }

  build() {
    Stack({ alignContent: Alignment.Center }) {
      if (this.pixelMap !== undefined) {
        Image(this.pixelMap)
          .width(96)
          .height(96)
          .objectFit(ImageFit.Cover)
          .borderRadius(12)
          .clip(true)
      } else {
        Text(this.failed ? 'IMG' : '…')
          .fontSize(11)
          .fontColor(HarnessColors.mutedText(this.useDark))
          .width(96)
          .height(96)
          .textAlign(TextAlign.Center)
          .backgroundColor(HarnessColors.subtleBg(this.useDark))
          .borderRadius(12)
          .clip(true)
      }
    }
    .width(96)
    .height(96)
    .borderRadius(12)
    .clip(true)
  }
}

function isImageAttachment(item: UserAttachmentRow): boolean {
  const lower = item.fileName.toLowerCase();
  return item.mediaType.startsWith('image/') || item.fileKind === 'image' ||
    lower.endsWith('.png') || lower.endsWith('.jpg') || lower.endsWith('.jpeg') ||
    lower.endsWith('.webp');
}

function fileExtensionLabel(fileName: string): string {
  const dot = fileName.lastIndexOf('.');
  if (dot < 0 || dot === fileName.length - 1) {
    return 'FILE';
  }
  return fileName.substring(dot + 1).toUpperCase().substring(0, 4);
}

@Component
struct ArtifactCard {
  @Prop artifact: ArtifactCardRow = { artifactId: '', fileName: '' };
  @Prop useDark: boolean = false;
  onOpen: (artifact: ArtifactCardRow) => void = () => {
  };

  private subtitle(): string {
    const parts: string[] = [];
    if ((this.artifact.fileKind ?? '').length > 0) {
      parts.push(this.artifact.fileKind ?? '');
    }
    if (this.artifact.versionNumber !== undefined) {
      parts.push(`v${this.artifact.versionNumber}`);
    }
    if ((this.artifact.status ?? '').length > 0) {
      parts.push(this.artifact.status ?? '');
    }
    if (this.artifact.isCurrent === true) {
      parts.push('当前版本');
    }
    return parts.join(' · ');
  }

  build() {
    Row({ space: 10 }) {
      Text((this.artifact.fileKind ?? 'FILE').toUpperCase().substring(0, 4))
        .fontSize(10)
        .fontWeight(FontWeight.Bold)
        .fontColor(HarnessColors.linkText(this.useDark))
        .width(34)
        .height(34)
        .textAlign(TextAlign.Center)
        .backgroundColor(HarnessColors.subtleBg(this.useDark))
        .borderRadius(8)
      Column({ space: 2 }) {
        Text(this.artifact.fileName)
          .fontSize(14)
          .fontWeight(FontWeight.Medium)
          .fontColor(HarnessColors.primaryText(this.useDark))
          .maxLines(1)
          .textOverflow({ overflow: TextOverflow.Ellipsis })
        Text(this.subtitle())
          .fontSize(11)
          .fontColor(HarnessColors.mutedText(this.useDark))
          .maxLines(1)
      }
      .layoutWeight(1)
      .alignItems(HorizontalAlign.Start)
    }
    .width('100%')
    .padding({ left: 12, right: 12, top: 10, bottom: 10 })
    .backgroundColor(HarnessColors.surface(this.useDark))
    .borderRadius(12)
    .border({ width: 1, color: HarnessColors.composerBorder(this.useDark) })
    .onClick(() => this.onOpen(this.artifact))
  }
}
