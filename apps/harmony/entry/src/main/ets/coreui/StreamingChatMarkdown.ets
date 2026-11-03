import { ChatMarkdown } from './ChatMarkdown';
import { StreamingMarkdown } from './StreamingMarkdown';

/** Run 中流式正文：预处理 + 节流后再走 ChatMarkdown。 */
@Component
export struct StreamingChatMarkdown {
  @Prop @Watch('onMarkdownChanged') markdown: string = '';
  @Prop fontSize: number = 15;
  @Prop useDark: boolean = false;
  @Prop compact: boolean = false;
  @Prop followsProcessTimeline: boolean = false;
  @Prop debounceMs: number = StreamingMarkdown.DEFAULT_DEBOUNCE_MS;
  @State private displayed: string = '';
  private debounceTimer: number = -1;

  aboutToDisappear(): void {
    if (this.debounceTimer >= 0) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = -1;
    }
  }

  onMarkdownChanged(): void {
    if (this.displayed.length === 0 && this.markdown.length > 0) {
      this.displayed = StreamingMarkdown.prepareForParse(this.markdown);
    }
    if (this.debounceTimer >= 0) {
      clearTimeout(this.debounceTimer);
    }
    this.debounceTimer = setTimeout((): void => {
      this.displayed = StreamingMarkdown.prepareForParse(this.markdown);
      this.debounceTimer = -1;
    }, this.debounceMs);
  }

  aboutToAppear(): void {
    this.onMarkdownChanged();
  }

  build() {
    if (this.displayed.length > 0) {
      ChatMarkdown({
        markdown: this.displayed,
        fontSize: this.fontSize,
        useDark: this.useDark,
        compact: this.compact,
        followsProcessTimeline: this.followsProcessTimeline,
      })
    }
  }
}
