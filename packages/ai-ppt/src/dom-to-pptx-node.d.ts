declare module 'dom-to-pptx/node' {
  export type ExportHtmlToPptxOptions = {
    selector?: string;
    injectBundle?: boolean;
    browserWidth?: number;
    browserHeight?: number;
    pptxOptions?: {
      width?: number;
      height?: number;
      includePseudoElements?: boolean;
    };
  };

  export function exportHtmlToPptx(
    htmlSource: string,
    options?: ExportHtmlToPptxOptions,
  ): Promise<Buffer>;
}
