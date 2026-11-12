import { z } from 'zod';
import { artifactRefSchema, fileRefSchema } from '../files/contracts.js';
import { AGENT_PROTOCOL_LIMITS } from '../common/constants.js';

// AI PPT 的输入是一份受约束的 deck plan。渲染器只消费这份结构，
// 模型不直接写 HTML/CSS；协议层与渲染层共用同一份 schema，避免漂移。
export const tableDataSchema = z.object({
  headers: z.array(z.string()).min(1),
  rows: z.array(z.array(z.string())).min(1),
});

export const chartDataSchema = z.object({
  type: z.string(),
  labels: z.array(z.string()),
  series: z.array(z.object({ name: z.string(), values: z.array(z.number()) })),
});

export const deckPlanSlideSchema = z
  .object({
    id: z.string(),
    kind: z.enum(['cover', 'toc', 'section', 'content', 'closing']),
    claim: z.string(),
    layoutId: z.enum(['cover', 'agenda', 'section', 'three-col', 'table', 'conclusion']),
    content: z.record(z.union([z.string(), z.array(z.string()), chartDataSchema, tableDataSchema])),
    evidence: z.array(z.object({ text: z.string(), sourceUrl: z.string().optional() })).optional(),
    visualIntent: z.enum(['none', 'image', 'chart', 'diagram', 'quote']).optional(),
  })
  .superRefine((slide, context) => {
    // 版式决定渲染器读取哪些字段。在参数阶段拒绝缺字段的 deck plan，
    // 比进入渲染后抛错更容易让模型自我修正，也避免误报成存储失败。
    const requiredStrings: Record<string, string[]> = {
      cover: ['title'],
      section: ['number', 'title'],
    };
    const requiredStringArrays: Record<string, string[]> = {
      agenda: ['items'],
      'three-col': ['columns'],
      conclusion: ['points'],
    };
    for (const field of requiredStrings[slide.layoutId] ?? []) {
      const value = slide.content[field];
      if (typeof value !== 'string' || value.trim().length === 0) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['content', field],
          message: `${slide.layoutId} 版式需要非空字符串 ${field}`,
        });
      }
    }
    for (const field of requiredStringArrays[slide.layoutId] ?? []) {
      const value = slide.content[field];
      if (!Array.isArray(value) || value.length === 0) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['content', field],
          message: `${slide.layoutId} 版式需要非空字符串数组 ${field}`,
        });
      }
    }
    if (slide.layoutId === 'table') {
      const parsed = tableDataSchema.safeParse(slide.content.table);
      if (!parsed.success) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['content', 'table'],
          message: 'table 版式需要 headers/rows 表格数据',
        });
      }
    }
  });

export const deckPlanSchema = z.object({
  version: z.literal(1),
  meta: z.object({
    title: z.string().trim().min(1).max(200),
    audience: z.string().max(200),
    language: z.string().max(32),
    aspectRatio: z.literal('16:9'),
    styleId: z.string().max(64),
  }),
  slides: z.array(deckPlanSlideSchema).min(1).max(AGENT_PROTOCOL_LIMITS.pptExportMaxSlides),
});

// 两种来源共用同一条导出链：模型直接给 deckPlan，或复用已交付的 HTML。
// HTML 路径让大 deck 不再依赖一次性在工具参数里输出完整 JSON，避免被输出预算截断。
export const pptExportInputSchema = z
  .object({
    fileName: z
      .string()
      .trim()
      .min(1)
      .max(120)
      .refine((value) => /^[^\\/\0]+\.pptx$/iu.test(value) && value !== '.' && value !== '..', {
        message: 'fileName must be a plain .pptx file name',
      }),
    deckPlan: deckPlanSchema.optional(),
    htmlFileId: z.string().trim().min(1).optional(),
  })
  .strict()
  .superRefine((value, context) => {
    const hasPlan = value.deckPlan !== undefined;
    const hasHtml = value.htmlFileId !== undefined;
    if (hasPlan === hasHtml) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['deckPlan'],
        message: '必须且只能提供 deckPlan 或 htmlFileId 之一',
      });
      return;
    }
    if (
      value.deckPlan &&
      [...JSON.stringify(value.deckPlan)].length > AGENT_PROTOCOL_LIMITS.pptExportMaxCodePoints
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['deckPlan'],
        message: 'deck plan exceeds size limit',
      });
    }
  });

// 事件与历史快照只保存摘要，绝不重复携带整份 deck plan。
export const pptExportInputSummarySchema = z
  .object({
    fileName: z.string().min(1),
    // 兼容 source 引入前的事件与历史快照。
    source: z.enum(['plan', 'html']).optional(),
    title: z.string().min(1).optional(),
    slideCount: z.number().int().positive().optional(),
    htmlFileId: z.string().min(1).optional(),
    audience: z.string().optional(),
    language: z.string().optional(),
  })
  .strict();

/** 从未校验的原始工具入参提取安全摘要；事件、日志、历史快照只保存这些字段。 */
export function toPptExportInputSummary(input: unknown): unknown {
  if (typeof input !== 'object' || input === null) return input;
  const value = input as {
    fileName?: unknown;
    htmlFileId?: unknown;
    deckPlan?: {
      meta?: { title?: unknown; audience?: unknown; language?: unknown };
      slides?: unknown;
    };
  };
  const slides = Array.isArray(value.deckPlan?.slides) ? value.deckPlan.slides : [];
  const meta = value.deckPlan?.meta;
  const summary: Record<string, unknown> = {
    fileName: typeof value.fileName === 'string' ? value.fileName : '',
    source: typeof value.htmlFileId === 'string' ? 'html' : 'plan',
  };
  if (typeof value.htmlFileId === 'string') summary.htmlFileId = value.htmlFileId;
  if (typeof meta?.title === 'string') summary.title = meta.title;
  if (slides.length > 0) summary.slideCount = slides.length;
  if (typeof meta?.audience === 'string') summary.audience = meta.audience;
  if (typeof meta?.language === 'string') summary.language = meta.language;
  return summary;
}

export const pptExportCheckSchema = z.object({
  code: z.string(),
  level: z.enum(['error', 'warn']),
  passed: z.boolean(),
  value: z.number().optional(),
  threshold: z.number().optional(),
  detail: z.string().optional(),
});

export const pptExportReportSchema = z.object({
  planVersion: z.number(),
  env: z.object({
    imageDigest: z.string().optional(),
    fonts: z.array(z.string()),
    chromeVersion: z.string().optional(),
  }),
  checks: z.array(pptExportCheckSchema),
  metrics: z
    .object({
      slides: z.number().optional(),
      tables: z.number().optional(),
      runs: z.number().optional(),
      cjkCoverage: z.number().optional(),
      exportMs: z.number().optional(),
      overflowContainers: z.number().optional(),
      pipelineMs: z.number().optional(),
    })
    .optional(),
  degrade: z.enum(['none', 'html_only', 'pdf_only']).optional(),
  failureReason: z.string().optional(),
  failureCode: z.string().optional(),
});

export const pptExportResultSchema = z.object({
  // ok: PPTX 通过硬门禁，并附带同一渲染源的 HTML 预览；
  // degraded: PPTX 未通过硬门禁，只交付 HTML 并附明确失败原因。
  status: z.enum(['ok', 'degraded']),
  artifact: artifactRefSchema,
  file: fileRefSchema,
  /** PPTX 成功时同时交付的 HTML 预览；导出降级时它是主产物。 */
  preview: z
    .object({
      artifact: artifactRefSchema,
      file: fileRefSchema,
    })
    .optional(),
  report: pptExportReportSchema,
});

export type DeckPlan = z.infer<typeof deckPlanSchema>;
export type DeckPlanSlide = z.infer<typeof deckPlanSlideSchema>;
export type TableData = z.infer<typeof tableDataSchema>;
export type ChartData = z.infer<typeof chartDataSchema>;
export type PptExportInput = z.infer<typeof pptExportInputSchema>;
export type PptExportInputSummary = z.infer<typeof pptExportInputSummarySchema>;
export type PptExportReport = z.infer<typeof pptExportReportSchema>;
export type PptExportResult = z.infer<typeof pptExportResultSchema>;
