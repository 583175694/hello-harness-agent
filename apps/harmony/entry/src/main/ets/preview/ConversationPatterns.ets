import { HarnessColors } from '../coreui/HarnessColors';
import { ChatMarkdown } from '../coreui/ChatMarkdown';
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
      .padding({ left: 16, right: 16, top: 12, bottom: 12 })
      .backgroundColor(HarnessColors.userBubbleBg(this.useDark))
      .borderRadius(22)
      .constraintSize({ maxWidth: '82%' })
    }
    .width('100%')
    .padding({ top: 8, bottom: 8 })
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

  build() {
    Column({ space: 8 }) {
      if (this.line.process.length > 0) {
        AssistantProcessTimeline({
          blocks: this.line.process,
          running: this.streaming,
          finalOutputVisible: this.line.text.length > 0 && !this.streaming,
          useDark: this.useDark,
          reduceMotion: this.reduceMotion,
          onOpenWorkbench: this.onOpenWorkbenchStep,
        })
      }
      if (this.streaming) {
        Text(this.line.text.length > 0 ? this.line.text : '▍')
          .fontSize(this.fontSize)
          .fontColor(HarnessColors.secondaryText(this.useDark))
          .width('100%')
      } else {
        ChatMarkdown({ markdown: this.line.text, fontSize: this.fontSize, useDark: this.useDark })
          .width('100%')
      }
    }
    .width('100%')
    .padding({ top: 8, bottom: 8 })
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
