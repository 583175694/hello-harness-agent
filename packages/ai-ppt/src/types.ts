import { z } from 'zod';

export const FONT_FAMILY =
  '"Noto Sans SC", "Microsoft YaHei", sans-serif' as const;

export const FONT_FAMILY_BLACKLIST = [
  '-apple-system',
  'system-ui',
  'BlinkMacSystemFont',
  'PingFang SC',
] as const;

export const tableDataSchema = z.object({
  headers: z.array(z.string()).min(1),
  rows: z.array(z.array(z.string())).min(1),
});

export type TableData = z.infer<typeof tableDataSchema>;

export const chartDataSchema = z.object({
  type: z.string(),
  labels: z.array(z.string()),
  series: z.array(z.object({ name: z.string(), values: z.array(z.number()) })),
});

export type ChartData = z.infer<typeof chartDataSchema>;

export const deckPlanSlideSchema = z.object({
  id: z.string(),
  kind: z.enum(['cover', 'toc', 'section', 'content', 'closing']),
  claim: z.string(),
  layoutId: z.enum(['cover', 'agenda', 'section', 'three-col', 'table', 'conclusion']),
  content: z.record(z.union([z.string(), z.array(z.string()), chartDataSchema, tableDataSchema])),
  evidence: z
    .array(z.object({ text: z.string(), sourceUrl: z.string().optional() }))
    .optional(),
  visualIntent: z.enum(['none', 'image', 'chart', 'diagram', 'quote']).optional(),
});

export const deckPlanSchema = z.object({
  version: z.literal(1),
  meta: z.object({
    title: z.string(),
    audience: z.string(),
    language: z.string(),
    aspectRatio: z.literal('16:9'),
    styleId: z.string(),
  }),
  slides: z.array(deckPlanSlideSchema).min(1),
});

export type DeckPlan = z.infer<typeof deckPlanSchema>;

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
