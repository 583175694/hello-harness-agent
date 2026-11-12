import { z } from 'zod';
import {
  deckPlanSchema,
  deckPlanSlideSchema,
  tableDataSchema,
  chartDataSchema,
  type ChartData,
  type DeckPlan,
  type TableData,
} from '@harness/agent-protocol';

// Debian's fonts-noto-cjk ships "Noto Sans CJK SC"; the Google Fonts build
// ships "Noto Sans SC". Keep both in the stack so the same HTML renders
// correctly in the sandbox image and on macOS/Windows developer machines.
export const CJK_FONT_STACK = [
  '"Noto Sans CJK SC"',
  '"Noto Sans SC"',
  '"Microsoft YaHei"',
  'sans-serif',
] as const;

export const FONT_FAMILY = CJK_FONT_STACK.join(', ');

// Probe order: most likely family in the sandbox image first.
export const CJK_FONT_CANDIDATES = [
  'Noto Sans CJK SC',
  'Noto Sans SC',
  'Microsoft YaHei',
] as const;

export const FONT_FAMILY_BLACKLIST = [
  '-apple-system',
  'system-ui',
  'BlinkMacSystemFont',
  'PingFang SC',
] as const;

// deck plan 的契约由 @harness/agent-protocol 统一提供：工具入参、SSE 摘要、
// 渲染器消费的是同一份定义，避免出现“工具接受、渲染器拒绝”的漂移。
export { deckPlanSchema, deckPlanSlideSchema, tableDataSchema, chartDataSchema };
export type { DeckPlan, ChartData, TableData };

export const layoutSlotSchema = z.object({
  id: z.string(),
  role: z.enum(['title', 'body', 'metric', 'table', 'caption']),
  box: z.object({ x: z.number(), y: z.number(), w: z.number(), h: z.number() }),
  capacity: z.object({ minChars: z.number(), maxChars: z.number(), maxLines: z.number() }),
  styleRef: z.string(),
  decorative: z.boolean(),
});

export const layoutSchema = z.object({
  id: z.string(),
  canvas: z.object({ width: z.literal(1280), height: z.literal(720) }),
  slots: z.array(layoutSlotSchema),
});

export type Layout = z.infer<typeof layoutSchema>;

export const styleSpecSchema = z.object({
  id: z.string(),
  fontFamily: z.string(),
  colors: z.object({
    primary: z.string(),
    secondary: z.string(),
    background: z.string(),
    text: z.string(),
    muted: z.string(),
    accent: z.string(),
    tableHeader: z.string(),
  }),
  typography: z.object({
    coverTitle: z.number(),
    slideTitle: z.number(),
    sectionNumber: z.number(),
    body: z.number(),
    caption: z.number(),
    table: z.number(),
  }),
});

export type StyleSpec = z.infer<typeof styleSpecSchema>;

export type ReviewRecord = {
  slideId: string;
  inputHash: string;
  envHash: string;
  verdict: 'pass' | 'minor' | 'major' | 'blocked';
  issues: Array<{ code: string; message: string; bbox?: string }>;
  reviewedAt: string;
};

export type ExportReportCheck = {
  code: string;
  level: 'error' | 'warn';
  passed: boolean;
  value?: number;
  threshold?: number;
  detail?: string;
};

export type ExportReport = {
  planVersion: number;
  env: {
    imageDigest?: string;
    fonts: string[];
    chromeVersion?: string;
  };
  checks: ExportReportCheck[];
  metrics?: {
    slides?: number;
    tables?: number;
    runs?: number;
    cjkCoverage?: number;
    exportMs?: number;
    overflowContainers?: number;
  };
  degrade?: 'none' | 'html_only' | 'pdf_only';
  failureReason?: string;
  failureCode?: string;
};

export type BuildDeckPaths = {
  htmlPath: string;
  pptxPath?: string;
  reportPath?: string;
};

export type BuildDeckResult = {
  ok: boolean;
  paths: BuildDeckPaths;
  html: string;
  report: ExportReport;
  pptxBuffer?: Buffer;
};
