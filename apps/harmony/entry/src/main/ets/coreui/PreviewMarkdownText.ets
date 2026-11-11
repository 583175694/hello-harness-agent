import { ChatMarkdown } from './ChatMarkdown';

/** @deprecated 请优先使用 ChatMarkdown；Reader 等场景仍保留此别名。 */
@Component
export struct PreviewMarkdownText {
  @Prop markdown: string = '';
  @Prop fontSize: number = 15;
  @Prop useDark: boolean = false;

  build() {
    ChatMarkdown({
      markdown: this.markdown,
      fontSize: this.fontSize,
      useDark: this.useDark,
      compact: false,
    })
  }
}
