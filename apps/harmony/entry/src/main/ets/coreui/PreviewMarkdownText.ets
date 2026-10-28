import { HarnessColors } from './HarnessColors';

/** Gate A 轻量 Markdown（标题 / 列表 / fenced code），非完整解析器。 */
@Component
export struct PreviewMarkdownText {
  @Prop markdown: string = '';
  @Prop fontSize: number = 15;
  @Prop useDark: boolean = false;

  build() {
    Column({ space: 6 }) {
      ForEach(this.blocks(), (block: MarkdownBlock, index: number) => {
        if (block.kind === 'heading') {
          Text(block.text)
            .fontSize(this.fontSize + 3)
            .fontWeight(FontWeight.Bold)
            .fontColor(HarnessColors.primaryText(this.useDark))
            .width('100%')
        } else if (block.kind === 'code') {
          Text(block.text)
            .fontSize(12)
            .fontFamily('monospace')
            .fontColor(HarnessColors.terminalForeground(this.useDark))
            .padding(10)
            .width('100%')
            .backgroundColor(HarnessColors.terminalBackground(this.useDark))
            .borderRadius(8)
        } else if (block.kind === 'list') {
          Text(`• ${block.text}`)
            .fontSize(this.fontSize)
            .fontColor(HarnessColors.primaryText(this.useDark))
            .width('100%')
        } else {
          Text(block.text)
            .fontSize(this.fontSize)
            .fontColor(HarnessColors.primaryText(this.useDark))
            .width('100%')
        }
      }, (block: MarkdownBlock, index: number) => `${index}-${block.kind}-${block.text.length}`)
    }
  }

  private blocks(): MarkdownBlock[] {
    const out: MarkdownBlock[] = [];
    const lines = this.markdown.split('\n');
    let inCode = false;
    let codeBuf = '';
    lines.forEach((line) => {
      if (line.trim().startsWith('```')) {
        if (inCode) {
          out.push({ kind: 'code', text: codeBuf.trim() });
          codeBuf = '';
          inCode = false;
        } else {
          inCode = true;
        }
        return;
      }
      if (inCode) {
        codeBuf += `${line}\n`;
        return;
      }
      if (line.startsWith('# ')) {
        out.push({ kind: 'heading', text: line.substring(2) });
        return;
      }
      if (line.startsWith('## ')) {
        out.push({ kind: 'heading', text: line.substring(3) });
        return;
      }
      if (line.startsWith('- ')) {
        out.push({ kind: 'list', text: line.substring(2) });
        return;
      }
      if (line.trim().length > 0) {
        out.push({ kind: 'paragraph', text: line });
      }
    });
    if (codeBuf.length > 0) {
      out.push({ kind: 'code', text: codeBuf.trim() });
    }
    return out;
  }
}

interface MarkdownBlock {
  kind: string;
  text: string;
}
