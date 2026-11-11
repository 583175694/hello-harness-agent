import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { ExportReportCheck } from '../types.js';

const execFileAsync = promisify(execFile);

export type UnpackReport = {
  slides: number;
  tables: number;
  runs: number;
  cjkCoverage?: number;
  passed: boolean;
  failedChecks: string[];
  raw: Record<string, unknown>;
};

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
  const raw = JSON.parse(stdout) as Record<string, unknown>;
  const failedChecks = Array.isArray(raw.failedChecks) ? (raw.failedChecks as string[]) : [];
  return {
    slides: Number(raw.slides ?? 0),
    tables: Number(raw.tables ?? 0),
    runs: Number(raw.runs ?? 0),
    cjkCoverage: typeof raw.cjkCoverage === 'number' ? raw.cjkCoverage : undefined,
    passed: Boolean(raw.passed),
    failedChecks,
    raw,
  };
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
    const raw = JSON.parse(stdout) as Record<string, unknown>;
    const failedChecks = Array.isArray(raw.failedChecks) ? (raw.failedChecks as string[]) : [];
    return {
      slides: Number(raw.slides ?? 0),
      tables: Number(raw.tables ?? 0),
      runs: Number(raw.runs ?? 0),
      cjkCoverage: typeof raw.cjkCoverage === 'number' ? raw.cjkCoverage : undefined,
      passed: Boolean(raw.passed),
      failedChecks,
      raw,
    };
  } catch (error) {
    const err = error as { stdout?: string; stderr?: string; code?: number };
    if (err.stdout) {
      const raw = JSON.parse(err.stdout) as Record<string, unknown>;
      const failedChecks = Array.isArray(raw.failedChecks) ? (raw.failedChecks as string[]) : [];
      return {
        slides: Number(raw.slides ?? 0),
        tables: Number(raw.tables ?? 0),
        runs: Number(raw.runs ?? 0),
        cjkCoverage: typeof raw.cjkCoverage === 'number' ? raw.cjkCoverage : undefined,
        passed: false,
        failedChecks,
        raw,
      };
    }
    throw error;
  }
}

export function unpackToExportChecks(unpack: UnpackReport, expectedSlides: number): ExportReportCheck[] {
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
      code: 'unpack_passed',
      level: 'error',
      passed: unpack.passed && unpack.failedChecks.length === 0,
      detail: unpack.failedChecks.join('; ') || undefined,
    },
  ];
}
