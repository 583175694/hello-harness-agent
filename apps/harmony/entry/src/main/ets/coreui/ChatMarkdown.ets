import { HarnessColors } from './HarnessColors';

/** 对齐 Web `--markdown-flow-space`（11px）。 */
const BLOCK_GAP: number = 11;
/** 对齐 Web `.markdown-content li + li`（4px）。 */
const LIST_ITEM_GAP: number = 4;
const LIST_INDENT: number = 14;
const CODE_INNER_PADDING: number = 12;
const CONTROL_RADIUS: number = 8;
const LEADING_AT_14: number = 24;
const BUBBLE_LEADING_AT_14: number = 22;

/** 对话区 Markdown（用户 / 助手正文共用；标题 / 列表 / fenced code）。 */
@Component
export struct ChatMarkdown {
  @Prop markdown: string = '';
  @Prop fontSize: number = 15;
  @Prop useDark: boolean = false;
  /** 用户气泡内：首块不额外顶距 */
  @Prop compact: boolean = false;

  private blockWidth(): string {
    return this.compact ? 'auto' : '100%';
  }

  build() {
    Column() {
      ForEach(this.blocks(), (block: MarkdownBlock, index: number) => {
        if (block.kind === 'heading') {
          Text(block.text)
            .fontSize(this.headingSize(block.level))
            .fontWeight(block.level <= 2 ? FontWeight.Bold : FontWeight.Medium)
            .fontColor(HarnessColors.primaryText(this.useDark))
            .lineHeight(this.bodyLineHeight())
            .width(this.blockWidth())
            .margin({
              top: this.blockTopMargin(index, block) + this.headingTopMargin(index, block.level),
            })
        } else if (block.kind === 'code') {
          Text(block.text)
            .fontSize(12)
            .fontFamily('monospace')
            .lineHeight(Math.round(12 * 1.55))
            .fontColor(HarnessColors.terminalForeground(this.useDark))
            .padding(CODE_INNER_PADDING)
            .width('100%')
            .margin({ top: this.blockTopMargin(index, block) })
            .backgroundColor(HarnessColors.terminalBackground(this.useDark))
            .borderRadius(CONTROL_RADIUS)
        } else if (block.kind === 'list') {
          Text(`• ${block.text}`)
            .fontSize(this.fontSize)
            .lineHeight(this.bodyLineHeight())
            .fontColor(HarnessColors.primaryText(this.useDark))
            .width(this.blockWidth())
            .margin({ top: this.blockTopMargin(index, block) })
            .padding({ left: LIST_INDENT * (block.depth + 1) })
        } else if (block.kind === 'ordered') {
          Text(`${block.order}. ${block.text}`)
            .fontSize(this.fontSize)
            .lineHeight(this.bodyLineHeight())
            .fontColor(HarnessColors.primaryText(this.useDark))
            .width(this.blockWidth())
            .margin({ top: this.blockTopMargin(index, block) })
            .padding({ left: LIST_INDENT * (block.depth + 1) })
        } else if (block.kind === 'quote') {
          Text(block.text)
            .fontSize(this.fontSize)
            .lineHeight(this.bodyLineHeight())
            .fontColor(HarnessColors.primaryText(this.useDark))
            .width(this.blockWidth())
            .margin({ top: this.blockTopMargin(index, block) })
            .padding(CODE_INNER_PADDING)
            .backgroundColor(HarnessColors.surface(this.useDark))
            .borderRadius(CONTROL_RADIUS)
        } else if (block.kind === 'divider') {
          Divider()
            .color(HarnessColors.borderColor(this.useDark))
            .strokeWidth(1)
            .margin({ top: this.blockTopMargin(index, block) + 10, bottom: 10 })
        } else {
          Text(block.text)
            .fontSize(this.fontSize)
            .lineHeight(this.bodyLineHeight())
            .fontColor(HarnessColors.primaryText(this.useDark))
            .width(this.blockWidth())
            .margin({ top: this.blockTopMargin(index, block) })
        }
      }, (block: MarkdownBlock, index: number) => `${index}-${block.kind}-${block.text.length}`)
    }
    .alignItems(HorizontalAlign.Start)
  }

  private bodyLineHeight(): number {
    const leadingAt14 = this.compact ? BUBBLE_LEADING_AT_14 : LEADING_AT_14;
    return Math.round(this.fontSize * leadingAt14 / 14);
  }

  private blockTopMargin(index: number, block: MarkdownBlock): number {
    if (index === 0) {
      return 0;
    }
    const blocks = this.blocks();
    const prev = blocks[index - 1];
    if (this.isListLike(prev) && this.isListLike(block)) {
      return LIST_ITEM_GAP;
    }
    return BLOCK_GAP;
  }

  private isListLike(block: MarkdownBlock): boolean {
    return block.kind === 'list' || block.kind === 'ordered';
  }

  private headingSize(level: number): number {
    if (level <= 1) {
      return this.fontSize + 3;
    }
    if (level === 2) {
      return this.fontSize + 2;
    }
    return this.fontSize + 1;
  }

  private headingTopMargin(index: number, level: number): number {
    if (index === 0 || this.compact) {
      return 0;
    }
    if (level === 1) {
      return 12;
    }
    if (level === 2) {
      return 10;
    }
    if (level === 3) {
      return 8;
    }
    return 6;
  }

  private blocks(): MarkdownBlock[] {
    const out: MarkdownBlock[] = [];
    const lines = this.markdown.split('\n');
    let inCode = false;
    let codeLang = '';
    let codeBuf = '';
    lines.forEach((line) => {
      if (line.trim().startsWith('```')) {
        if (inCode) {
          const body = codeBuf.trim();
          const labeled = codeLang.length > 0 ? `${codeLang}\n${body}` : body;
          out.push({ kind: 'code', text: labeled, order: 0, depth: 0 });
          codeBuf = '';
          codeLang = '';
          inCode = false;
        } else {
          codeLang = line.trim().substring(3).trim();
          inCode = true;
        }
        return;
      }
      if (inCode) {
        codeBuf += `${line}\n`;
        return;
      }
      const heading = line.match(/^(#{1,6}) (.+)$/);
      if (heading) {
        out.push({
          kind: 'heading',
          text: heading[2],
          level: heading[1].length,
          order: 0,
          depth: 0,
        });
        return;
      }
      if (/^---+$/.test(line.trim())) {
        out.push({ kind: 'divider', text: '', order: 0, depth: 0 });
        return;
      }
      const quote = line.match(/^>\s?(.*)$/);
      if (quote) {
        out.push({ kind: 'quote', text: quote[1], order: 0, depth: 0 });
        return;
      }
      const ordered = line.match(/^(\s*)(\d+)\. (.+)$/);
      if (ordered) {
        const depth = Math.floor(ordered[1].length / 2);
        out.push({
          kind: 'ordered',
          text: ordered[3],
          order: parseInt(ordered[2], 10),
          depth,
        });
        return;
      }
      const bullet = line.match(/^(\s*)- (.+)$/);
      if (bullet) {
        const depth = Math.floor(bullet[1].length / 2);
        out.push({ kind: 'list', text: bullet[2], order: 0, depth });
        return;
      }
      if (line.trim().length > 0) {
        out.push({ kind: 'paragraph', text: line, order: 0, depth: 0 });
      }
    });
    if (codeBuf.length > 0) {
      const body = codeBuf.trim();
      const labeled = codeLang.length > 0 ? `${codeLang}\n${body}` : body;
      out.push({ kind: 'code', text: labeled, order: 0, depth: 0 });
    }
    if (out.length === 0 && this.markdown.trim().length > 0) {
      out.push({ kind: 'paragraph', text: this.markdown.trim(), order: 0, depth: 0 });
    }
    return out;
  }
}

interface MarkdownBlock {
  kind: string;
  text: string;
  level?: number;
  order: number;
  depth: number;
}
