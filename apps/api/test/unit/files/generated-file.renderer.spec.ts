import ExcelJS from 'exceljs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const browserMocks = vi.hoisted(() => {
  const page = {
    route: vi.fn().mockResolvedValue(undefined),
    setContent: vi.fn().mockResolvedValue(undefined),
    pdf: vi.fn().mockResolvedValue(Buffer.from('%PDF-1.7\nmock')),
    close: vi.fn().mockResolvedValue(undefined),
  };
  const browser = {
    newPage: vi.fn().mockResolvedValue(page),
    close: vi.fn().mockResolvedValue(undefined),
    on: vi.fn(),
  };
  return { page, browser, launch: vi.fn().mockResolvedValue(browser) };
});

vi.mock('playwright', () => ({ chromium: { launch: browserMocks.launch } }));

import {
  closeGeneratedFileRenderer,
  GeneratedFileRenderError,
  renderGeneratedFile,
} from '../../../src/files/generated-file.renderer';

const markdown = `# 中文报告

这是包含 **粗体**、[安全链接](https://example.com) 的正文。

- 第一项
- 第二项

| 指标 | 数值 |
| --- | ---: |
| 完成 | 42 |

\`\`\`ts
const value = 42;
\`\`\``;

describe('generated file renderer', () => {
  beforeEach(() => {
    browserMocks.page.route.mockClear();
    browserMocks.page.setContent.mockClear();
    browserMocks.page.pdf.mockReset().mockResolvedValue(Buffer.from('%PDF-1.7\nmock'));
    browserMocks.page.close.mockReset().mockResolvedValue(undefined);
    browserMocks.browser.newPage.mockClear();
    browserMocks.browser.close.mockClear();
    browserMocks.launch.mockReset().mockResolvedValue(browserMocks.browser);
  });

  afterEach(async () => {
    await closeGeneratedFileRenderer();
  });

  it('renders controlled Markdown as a complete HTML document and rejects active content', async () => {
    const result = await renderGeneratedFile({ fileName: '报告.html', content: markdown });
    expect(result.fileKind).toBe('html');
    expect(result.mediaType).toBe('text/html; charset=utf-8');
    expect(result.buffer.toString('utf8')).toContain('<!doctype html>');
    expect(result.buffer.toString('utf8')).toContain('<table>');
    expect(result.buffer.toString('utf8')).toContain('中文报告');
    await expect(
      renderGeneratedFile({ fileName: 'unsafe.html', content: '<script>alert(1)</script>' }),
    ).rejects.toBeInstanceOf(GeneratedFileRenderError);
    await expect(
      renderGeneratedFile({ fileName: 'image.pdf', content: '![x](https://example.com/x.png)' }),
    ).rejects.toBeInstanceOf(GeneratedFileRenderError);
  });

  it('creates a valid DOCX ZIP while preserving Markdown as normalized content', async () => {
    const result = await renderGeneratedFile({ fileName: '报告.docx', content: markdown });
    expect(result.buffer.subarray(0, 2).toString()).toBe('PK');
    expect(result.normalizedContent).toBe(markdown);
    expect(result.buffer.length).toBeGreaterThan(1_000);
  });

  it('creates typed multi-sheet XLSX data with cleaned names and stable normalized tables', async () => {
    const result = await renderGeneratedFile({
      fileName: '数据.xlsx',
      sheets: [
        {
          name: '销售/汇总',
          rows: [
            ['名称', '数值', '启用', '空值'],
            ['A|B\nC', 12.5, true, null],
          ],
        },
        { name: '销售汇总', rows: [['项目'], ['=1+1'], ['二组']] },
      ],
    });
    expect(result.buffer.subarray(0, 2).toString()).toBe('PK');
    expect(result.normalizedContent).toContain('[Sheet: 销售汇总]');
    expect(result.normalizedContent).toContain('[Sheet: 销售汇总 (2)]');
    expect(result.normalizedContent).toContain('A\\|B<br>C');

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(result.buffer as never);
    expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual(['销售汇总', '销售汇总 (2)']);
    expect(workbook.worksheets[0]!.getCell('B2').value).toBe(12.5);
    expect(workbook.worksheets[0]!.getCell('C2').value).toBe(true);
    expect(workbook.worksheets[0]!.getCell('A2').value).toBe('A|B\nC');
    expect(workbook.worksheets[1]!.getCell('A2').value).toBe('=1+1');
    expect(workbook.worksheets[1]!.getCell('A2').type).toBe(ExcelJS.ValueType.String);
  });

  it('reuses Chromium, blocks network requests, and always closes each PDF page', async () => {
    const first = await renderGeneratedFile({ fileName: '一.pdf', content: markdown });
    const second = await renderGeneratedFile({ fileName: '二.pdf', content: markdown });
    expect(first.buffer.subarray(0, 5).toString()).toBe('%PDF-');
    expect(second.buffer.subarray(0, 5).toString()).toBe('%PDF-');
    expect(browserMocks.launch).toHaveBeenCalledTimes(1);
    expect(browserMocks.browser.newPage).toHaveBeenCalledTimes(2);
    expect(browserMocks.page.route).toHaveBeenCalledWith('**/*', expect.any(Function));
    expect(browserMocks.page.close).toHaveBeenCalledTimes(2);
  });

  it('closes the active PDF page when cancellation arrives', async () => {
    let rejectPdf!: (error: Error) => void;
    browserMocks.page.pdf.mockImplementationOnce(
      () => new Promise<Buffer>((_resolve, reject) => (rejectPdf = reject)),
    );
    browserMocks.page.close.mockImplementation(async () => rejectPdf(new Error('page closed')));
    const controller = new AbortController();
    const pending = renderGeneratedFile(
      { fileName: 'cancel.pdf', content: markdown },
      controller.signal,
    );
    while (browserMocks.page.pdf.mock.calls.length === 0)
      await new Promise((resolve) => setTimeout(resolve, 1));
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    expect(browserMocks.page.close).toHaveBeenCalled();
  });

  it('limits PDF rendering to two active pages', async () => {
    let active = 0;
    let peak = 0;
    const releases: Array<() => void> = [];
    browserMocks.browser.newPage.mockImplementation(async () => ({
      route: vi.fn().mockResolvedValue(undefined),
      setContent: vi.fn().mockResolvedValue(undefined),
      pdf: vi.fn(async () => {
        active++;
        peak = Math.max(peak, active);
        await new Promise<void>((resolve) => releases.push(resolve));
        active--;
        return Buffer.from('%PDF-1.7\nmock');
      }),
      close: vi.fn().mockResolvedValue(undefined),
    }));
    const renders = ['a.pdf', 'b.pdf', 'c.pdf'].map((fileName) =>
      renderGeneratedFile({ fileName, content: '# report' }),
    );
    while (releases.length < 2) await new Promise((resolve) => setTimeout(resolve, 1));
    expect(browserMocks.browser.newPage).toHaveBeenCalledTimes(2);
    releases.shift()!();
    while (releases.length < 2) await new Promise((resolve) => setTimeout(resolve, 1));
    releases.splice(0).forEach((release) => release());
    await expect(Promise.all(renders)).resolves.toHaveLength(3);
    expect(peak).toBe(2);
  });

  it('reports Chromium launch failures as render unavailable without creating a fake PDF', async () => {
    browserMocks.launch.mockRejectedValueOnce(new Error('Executable does not exist'));
    await expect(
      renderGeneratedFile({ fileName: 'unavailable.pdf', content: markdown }),
    ).rejects.toMatchObject({ code: 'GENERATED_FILE_RENDER_UNAVAILABLE' });
  });
});
