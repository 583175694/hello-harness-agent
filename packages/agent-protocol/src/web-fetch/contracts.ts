import { z } from 'zod';
import { AGENT_PROTOCOL_LIMITS } from '../common/constants.js';

// 统计字符串中的 Unicode code point 数量，避免把代理对拆成两个位置。
function codePointLength(value: string): number {
  return Array.from(value).length;
}

// 定义模型调用批量网页读取工具时允许提交的参数。
const publicWebUrlSchema = z
  .string()
  .url()
  .refine((value) => /^https?:\/\//iu.test(value), '仅允许完整 HTTP/HTTPS URL');

// 定义模型调用批量网页读取工具时允许提交的参数。
export const webFetchInputSchema = z
  .object({
    urls: z.array(publicWebUrlSchema).min(1).max(AGENT_PROTOCOL_LIMITS.webFetchUrlsMax),
    query: z.string().trim().min(1).max(AGENT_PROTOCOL_LIMITS.webFetchQueryMaxLength).optional(),
  })
  .strict();

// 定义规范化 Markdown 原文片段的可恢复定位信息。
export const webTextLocatorSchema = z
  .object({
    kind: z.literal('web_text'),
    quote: z.object({
      exact: z.string().min(1),
      prefix: z.string().optional(),
      suffix: z.string().optional(),
    }),
    position: z.object({
      start: z.number().int().nonnegative(),
      end: z.number().int().positive(),
    }),
    sectionPath: z.array(z.string().min(1)).optional(),
  })
  .superRefine((locator, context) => {
    if (locator.position.end <= locator.position.start) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['position', 'end'],
        message: 'end 必须大于 start',
      });
      return;
    }
    if (codePointLength(locator.quote.exact) !== locator.position.end - locator.position.start) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['quote', 'exact'],
        message: 'exact 长度必须与 position 区间一致',
      });
    }
  });

// 定义一段未经改写的网页原文及其稳定标识。
export const webFetchPassageSchema = z
  .object({
    passageId: z.string().min(1),
    text: z.string().min(1),
    locator: webTextLocatorSchema,
  })
  .refine((passage) => passage.text === passage.locator.quote.exact, {
    path: ['locator', 'quote', 'exact'],
    message: 'Passage text 必须与 quote.exact 完全一致',
  });

// 定义单个 URL 成功读取后的规范化结果。
export const webFetchSucceededItemSchema = z.object({
  status: z.literal('succeeded'),
  requestedUrl: z.string().url(),
  finalUrl: z.string().url(),
  normalizedUrl: z.string().url(),
  title: z.string().min(1),
  author: z.string().min(1).optional(),
  publishedAt: z.string().min(1).optional(),
  language: z.string().min(1).optional(),
  contentType: z.string().min(1),
  retrievedAt: z.string().datetime(),
  contentHash: z.string().min(1),
  cacheStatus: z.enum(['hit', 'miss']),
  truncated: z.boolean(),
  passages: z.array(webFetchPassageSchema).max(AGENT_PROTOCOL_LIMITS.webFetchPassagesMax),
});

// 定义单个 URL 无法读取时返回给模型的安全错误摘要。
export const webFetchFailedItemSchema = z.object({
  status: z.literal('failed'),
  requestedUrl: z.string(),
  code: z.string().min(1),
  detail: z.string().min(1),
});

// 定义无需发起或无需保留的 URL 结果，和真实网络失败保持语义分离。
export const webFetchSkippedItemSchema = z.object({
  status: z.literal('skipped'),
  requestedUrl: z.string(),
  code: z.string().min(1),
  detail: z.string().min(1),
});

// 定义批量网页读取中每个 URL 的独立终态。
export const webFetchItemResultSchema = z.discriminatedUnion('status', [
  webFetchSucceededItemSchema,
  webFetchFailedItemSchema,
  webFetchSkippedItemSchema,
]);

// 定义一次网页读取调用已经发生的纯事实统计，不携带跨调用控制语义。
export const webFetchStatsSchema = z.object({
  requestedCount: z.number().int().nonnegative(),
  networkAttemptCount: z.number().int().nonnegative(),
  succeededCount: z.number().int().nonnegative(),
  failedCount: z.number().int().nonnegative(),
  skippedCount: z.number().int().nonnegative(),
  passageCount: z.number().int().nonnegative(),
  passageCharacterCount: z.number().int().nonnegative(),
  cacheHitCount: z.number().int().nonnegative(),
});

// 定义 web_fetch 返回给 Runtime、SSE 和 Workbench 的批量结果。
export const webFetchResultSchema = z.object({
  query: z.string().min(1).optional(),
  results: z.array(webFetchItemResultSchema).min(1).max(AGENT_PROTOCOL_LIMITS.webFetchUrlsMax),
  stats: webFetchStatsSchema,
});

export type WebFetchInput = z.infer<typeof webFetchInputSchema>;
export type WebTextLocator = z.infer<typeof webTextLocatorSchema>;
export type WebFetchPassage = z.infer<typeof webFetchPassageSchema>;
export type WebFetchSucceededItem = z.infer<typeof webFetchSucceededItemSchema>;
export type WebFetchFailedItem = z.infer<typeof webFetchFailedItemSchema>;
export type WebFetchSkippedItem = z.infer<typeof webFetchSkippedItemSchema>;
export type WebFetchItemResult = z.infer<typeof webFetchItemResultSchema>;
export type WebFetchStats = z.infer<typeof webFetchStatsSchema>;
export type WebFetchResult = z.infer<typeof webFetchResultSchema>;
