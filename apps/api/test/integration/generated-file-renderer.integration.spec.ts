import ExcelJS from 'exceljs';
import { OfficeParser } from 'officeparser';
import { PDFParse } from 'pdf-parse';
import { afterAll, describe, expect, it } from 'vitest';

import {
  closeGeneratedFileRenderer,
  renderGeneratedFile,
} from '../../src/files/generated-file.renderer';

const chineseReport = `# 中文行业报告

## 结论

这是用于验证中文、**重点内容**和[普通链接](https://example.com)的报告。

- 市场保持增长
- 风险总体可控

| 指标 | 结果 |
| --- | ---: |
| 增长率 | 18% |

\`\`\`ts
const conclusion = "稳定";
\`\`\``;

const longTechnicalReport = `${chineseReport}\n\n${Array.from(
  { length: 90 },
  (_, index) =>
    `## 技术章节 ${index + 1}\n\n分页边界验证内容 ${index + 1}：中文与 English mixed content。`,
).join('\n\n')}`;

describe('C2-C real format rendering', () => {
  afterAll(async () => closeGeneratedFileRenderer());

  it('generates HTML, PDF, DOCX, and XLSX that standard parsers can reopen', async () => {
    const html = await renderGeneratedFile({ fileName: '中文报告.html', content: chineseReport });
    expect(html.buffer.toString('utf8')).toMatch(/^<!doctype html>/u);
    expect(html.buffer.toString('utf8')).toContain('中文行业报告');
    expect(html.buffer.toString('utf8')).not.toMatch(/<script|<iframe|<img/iu);

    const pdf = await renderGeneratedFile({
      fileName: '技术报告.pdf',
      content: longTechnicalReport,
    });
    const pdfParser = new PDFParse({ data: pdf.buffer });
    try {
      const info = await pdfParser.getInfo();
      const text = await pdfParser.getText();
      const normalizedPdfText = text.text.normalize('NFKC');
      expect(info.total).toBeGreaterThan(1);
      expect(normalizedPdfText).toContain('中文行业报告');
      expect(normalizedPdfText).toContain('技术章节 90');
    } finally {
      await pdfParser.destroy();
    }

    const docx = await renderGeneratedFile({ fileName: '中文报告.docx', content: chineseReport });
    const document = await OfficeParser.parseOffice(docx.buffer, {
      fileType: 'docx',
      extractAttachments: false,
      ocr: false,
    });
    expect((await document.to('md')).value).toContain('中文行业报告');
    expect((await document.to('md')).value).toContain('市场保持增长');

    const xlsx = await renderGeneratedFile({
      fileName: '多表数据.xlsx',
      sheets: [
        {
          name: '销售/汇总',
          rows: [
            ['区域', '销售额', '启用', '备注'],
            ['华东', 1200000, true, null],
          ],
        },
        {
          name: '销售汇总',
          rows: [
            ['项目', '值'],
            ['公式文本', '=1+1'],
          ],
        },
      ],
    });
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(xlsx.buffer as never);
    expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual(['销售汇总', '销售汇总 (2)']);
    expect(workbook.worksheets[0]!.getCell('B2').value).toBe(1200000);
    expect(workbook.worksheets[0]!.getCell('C2').value).toBe(true);
    expect(workbook.worksheets[1]!.getCell('B2').value).toBe('=1+1');
    expect(xlsx.normalizedContent).toContain('[Sheet: 销售汇总 (2)]');
  }, 30_000);
});
