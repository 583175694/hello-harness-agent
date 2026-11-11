import { exportHtmlToPptx } from 'dom-to-pptx/node';

export type ExportPptxOptions = {
  htmlPath: string;
  timeoutMs?: number;
};

export async function exportDeckToPptxBuffer(htmlPath: string): Promise<Buffer> {
  const buffer = await exportHtmlToPptx(htmlPath, {
    selector: '.slide',
    injectBundle: true,
    browserWidth: 1280,
    browserHeight: 720,
    pptxOptions: {
      width: 13.333,
      height: 7.5,
      includePseudoElements: true,
    },
  });
  return buffer;
}
