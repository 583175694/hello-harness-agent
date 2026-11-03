import { HarnessColors } from '../coreui/HarnessColors';
import { HarnessLayout } from '../coreui/HarnessLayout';
import { ChatMarkdown } from '../coreui/ChatMarkdown';
import { StreamingChatMarkdown } from '../coreui/StreamingChatMarkdown';
import { PreviewLocalPreferences } from './PreviewLocalPreferences';
import { ChatLine } from './PreviewModels';
import { AssistantProcessTimeline } from './ProcessTimeline';

/** Pattern：UserMessageBubble */
@Component
export struct UserMessageBubble {
  @Prop text: string = '';
  @Prop fontSize: number = PreviewLocalPreferences.contentFontSize;
  @Prop useDark: boolean = false;

  build() {
    Row() {
      Blank().layoutWeight(1)
      Column() {
        ChatMarkdown({ markdown: this.text, fontSize: this.fontSize, useDark: this.useDark, compact: true })
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

  build() {
    if (this.line.role === 'user') {
      UserMessageBubble({ text: this.line.text, fontSize: this.fontSize, useDark: this.useDark })
    } else {
      AssistantTurnContent({
        line: this.line,
        streaming: this.streamingTail,
        fontSize: this.fontSize,
        useDark: this.useDark,
        reduceMotion: this.reduceMotion,
        onOpenWorkbenchStep: this.onOpenWorkbenchStep,
      })
    }
  }
}
