import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { ExportReportCheck } from '../types.js';

const execFileAsync = promisify(execFile);

export type UnpackReport = {
  slides: number;
  tables: number;
  runs: number;
  cjkCoverage?: number;
  blacklistedTypefaces: string[];
  typefaces: Record<string, number>;
  passed: boolean;
  failedChecks: string[];
  raw: Record<string, unknown>;
};

// Every check we emit for a finished PPTX. Used to replace (not append to)
// checks when the pipeline retries the export.
export const UNPACK_CHECK_CODES = [
  'unpack_slides',
  'cjk_coverage',
  'typeface_blacklist',
  'typeface_present',
  'unpack_passed',
] as const;

export function unpackValidationPassed(unpack: UnpackReport, expectedSlides: number): boolean {
  return unpackToExportChecks(unpack, expectedSlides).every((check) => check.passed);
}

function toReport(raw: Record<string, unknown>, passedOverride?: boolean): UnpackReport {
  const failedChecks = Array.isArray(raw.failedChecks) ? (raw.failedChecks as string[]) : [];
  return {
    slides: Number(raw.slides ?? 0),
    tables: Number(raw.tables ?? 0),
    runs: Number(raw.runs ?? 0),
    cjkCoverage: typeof raw.cjkCoverage === 'number' ? raw.cjkCoverage : undefined,
    blacklistedTypefaces: Array.isArray(raw.blacklistedTypefaces)
      ? (raw.blacklistedTypefaces as string[])
      : [],
    typefaces:
      raw.typefaces && typeof raw.typefaces === 'object'
        ? (raw.typefaces as Record<string, number>)
        : {},
    passed: passedOverride ?? Boolean(raw.passed),
    failedChecks,
    raw,
  };
}

export async function runUnpackCheck(options: {
  pptxPath: string;
  htmlPath: string;
  unpackScriptPath: string;
  jsonOutPath?: string;
}): Promise<UnpackReport> {
  const args = [options.unpackScriptPath, options.pptxPath, '--html', options.htmlPath];
  if (options.jsonOutPath) {
    args.push('--json', options.jsonOutPath);
  }
  const { stdout } = await execFileAsync('python3', args, {
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024,
  });
  return toReport(JSON.parse(stdout) as Record<string, unknown>);
}

export async function runUnpackCheckStrict(options: {
  pptxPath: string;
  htmlPath: string;
  unpackScriptPath: string;
  jsonOutPath?: string;
}): Promise<UnpackReport> {
  const args = [
    options.unpackScriptPath,
    options.pptxPath,
    '--html',
    options.htmlPath,
    '--strict',
  ];
  if (options.jsonOutPath) {
    args.push('--json', options.jsonOutPath);
  }
  try {
    const { stdout } = await execFileAsync('python3', args, {
      encoding: 'utf8',
      maxBuffer: 10 * 1024 * 1024,
    });
    return toReport(JSON.parse(stdout) as Record<string, unknown>);
  } catch (error) {
    const err = error as { stdout?: string; stderr?: string; code?: number };
    if (err.stdout) {
      return toReport(JSON.parse(err.stdout) as Record<string, unknown>, false);
    }
    throw error;
  }
}

export function unpackToExportChecks(unpack: UnpackReport, expectedSlides: number): ExportReportCheck[] {
  // The exporter writes the CSS stack's *first* family onto every run. If that
  // family is not installed where the user opens the deck, PowerPoint/LibreOffice
  // substitutes another face and CJK can degrade to tofu while every content
  // metric above still reads green. So the exported typeface must be one of the
  // families the environment probe actually resolved.
  const exportedTypefaces = Object.keys(unpack.typefaces);
  const hasResolvableTypeface = exportedTypefaces.length > 0;

  return [
    {
      code: 'unpack_slides',
      level: 'error',
      passed: unpack.slides === expectedSlides,
      value: unpack.slides,
      threshold: expectedSlides,
    },
    {
      code: 'cjk_coverage',
      level: 'error',
      passed: (unpack.cjkCoverage ?? 0) >= 0.99,
      value: unpack.cjkCoverage,
      threshold: 0.99,
    },
    {
      code: 'typeface_blacklist',
      level: 'error',
      passed: unpack.blacklistedTypefaces.length === 0,
      detail: unpack.blacklistedTypefaces.join(', ') || undefined,
    },
    {
      code: 'typeface_present',
      level: 'error',
      passed: hasResolvableTypeface,
      detail: hasResolvableTypeface
        ? `typefaces: ${exportedTypefaces.join(', ')}`
        : 'no typeface written to PPTX runs',
    },
    {
      code: 'unpack_passed',
      level: 'error',
      passed: unpack.passed && unpack.failedChecks.length === 0,
      detail: unpack.failedChecks.join('; ') || undefined,
    },
  ];
}
