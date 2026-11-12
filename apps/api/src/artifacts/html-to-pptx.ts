import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import type { BuildDeckResult } from '@harness/ai-ppt';

/** 与 @harness/ai-ppt 的 exportHtmlFileToPptx 保持结构兼容。 */
export const ARTIFACTS_PPT_EXPORT_OPTIONS = Symbol('ARTIFACTS_PPT_EXPORT_OPTIONS');

export type ArtifactsPptExportOptions = {
  run?: HtmlToPptxRunner;
  exportPptx?: (htmlPath: string) => Promise<Buffer>;
};

export type HtmlToPptxRunner = (input: {
  html: Buffer;
  fileName: string;
  outDir: string;
  unpackScriptPath: string;
  exportPptx: (htmlPath: string) => Promise<Buffer>;
}) => Promise<BuildDeckResult>;

export function resolveUnpackScriptPath(): string {
  const moduleDir = __dirname;
  return (
    resolveFirstExisting([
      resolve(moduleDir, '../../../../scripts/ppt-unpack-check.py'),
      resolve(moduleDir, '../../../scripts/ppt-unpack-check.py'),
      resolve(process.cwd(), 'scripts/ppt-unpack-check.py'),
      resolve(process.cwd(), '../../scripts/ppt-unpack-check.py'),
    ]) ?? resolve(process.cwd(), 'scripts/ppt-unpack-check.py')
  );
}

function resolveFirstExisting(candidates: string[]): string | undefined {
  return candidates.find((candidate) => candidate.length > 0 && existsSync(candidate));
}

/**
 * `@harness/ai-ppt` is ESM while the API compiles to CommonJS. A static import
 * would be rewritten to require() and fail at boot, so resolve it at call time.
 * `new Function` keeps TypeScript from down-levelling this genuinely dynamic import.
 */
export async function loadDefaultHtmlFileExporter(): Promise<
  typeof import('@harness/ai-ppt').exportHtmlFileToPptx
> {
  const dynamicImport = new Function('specifier', 'return import(specifier)') as (
    specifier: string,
  ) => Promise<typeof import('@harness/ai-ppt')>;
  const pkg = await dynamicImport('@harness/ai-ppt');
  return pkg.exportHtmlFileToPptx;
}

export async function loadDefaultPptxExporter(): Promise<(htmlPath: string) => Promise<Buffer>> {
  const dynamicImport = new Function('specifier', 'return import(specifier)') as (
    specifier: string,
  ) => Promise<typeof import('@harness/ai-ppt')>;
  const pkg = await dynamicImport('@harness/ai-ppt');
  return (htmlPath) => pkg.exportDeckToPptxBuffer(htmlPath);
}
