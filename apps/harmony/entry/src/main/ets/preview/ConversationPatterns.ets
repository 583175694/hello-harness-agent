import { HarnessColors } from '../coreui/HarnessColors';
import { PreviewMarkdownText } from '../coreui/PreviewMarkdownText';
import { Spinner } from '../coreui/Spinner';
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
      Text(this.text)
        .fontSize(this.fontSize)
        .fontColor(HarnessColors.primaryText(this.useDark))
        .padding({ left: 16, right: 16, top: 10, bottom: 10 })
        .backgroundColor(HarnessColors.userBubbleBg(this.useDark))
        .borderRadius(22)
        .width('82%')
    }
    .width('100%')
    .padding({ top: 4, bottom: 4 })
  }
}

/** Pattern：AssistantTurnContent（Process + 流式/Markdown/纯文本） */
@Component
export struct AssistantTurnContent {
  @Prop line: ChatLine = { role: 'assistant', text: '', process: [] };
  @Prop streaming: boolean = false;
  @Prop fontSize: number = PreviewLocalPreferences.contentFontSize;
  @Prop useDark: boolean = false;
  onOpenWorkbenchStep: (toolCallId: string) => void = () => {
  };

  build() {
    Column({ space: 6 }) {
      if (this.line.process.length > 0) {
        AssistantProcessTimeline({
          blocks: this.line.process,
          running: this.streaming,
          finalOutputVisible: this.line.text.length > 0 && !this.streaming,
          useDark: this.useDark,
          onOpenWorkbench: this.onOpenWorkbenchStep,
        })
      }
      if (this.streaming && this.line.text.length === 0) {
        Text('▍').fontSize(this.fontSize)
        Spinner({ label: '', useDark: this.useDark })
      } else if (this.line.text.indexOf('#') >= 0 || this.line.text.indexOf('```') >= 0) {
        PreviewMarkdownText({ markdown: this.line.text, fontSize: this.fontSize, useDark: this.useDark })
          .padding(12)
          .width('100%')
          .backgroundColor(HarnessColors.surface(this.useDark))
          .borderRadius(12)
      } else {
        Text(this.line.text.length > 0 ? this.line.text : '▍')
          .fontSize(this.fontSize)
          .fontColor(HarnessColors.primaryText(this.useDark))
          .padding(12)
          .width('100%')
          .backgroundColor(HarnessColors.surface(this.useDark))
          .borderRadius(12)
      }
    }
    .width('100%')
    .padding({ top: 4, bottom: 4 })
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
        onOpenWorkbenchStep: this.onOpenWorkbenchStep,
      })
    }
  }
}
