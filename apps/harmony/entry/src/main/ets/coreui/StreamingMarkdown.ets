/** 流式 Markdown 预处理（与 KMP StreamingMarkdown 保持逻辑一致）。 */
export class StreamingMarkdown {
  static readonly DEFAULT_DEBOUNCE_MS: number = 120;

  static prepareForParse(source: string): string {
    if (source.length === 0) {
      return source;
    }
    let text = StreamingMarkdown.closeOpenFencedCodeBlocks(source);
    text = StreamingMarkdown.stripTrailingUnpairedDoubleAsterisk(text);
    return text;
  }

  static closeOpenFencedCodeBlocks(source: string): string {
    let fenceLines = 0;
    const lines = source.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const trimmed = lines[i].trimStart();
      if (trimmed.startsWith('```')) {
        fenceLines++;
      }
    }
    if (fenceLines % 2 === 0) {
      return source;
    }
    return `${source}\n\`\`\``;
  }

  static stripTrailingUnpairedDoubleAsterisk(source: string): string {
    let pairs = 0;
    let i = 0;
    while (i < source.length - 1) {
      if (source.charAt(i) === '*' && source.charAt(i + 1) === '*') {
        pairs++;
        i += 2;
      } else {
        i++;
      }
    }
    if (pairs % 2 === 0) {
      return source;
    }
    const last = source.lastIndexOf('**');
    if (last < 0) {
      return source;
    }
    return source.substring(0, last);
  }
}
