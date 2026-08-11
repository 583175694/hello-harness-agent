import { z } from 'zod';

// 校验固定题集的类别、suite 和确定性预期契约。
export const researchEvalCaseSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/u),
  version: z.string().min(1),
  category: z.enum([
    'direct_answer',
    'direct_url',
    'product_comparison',
    'current_research',
    'technical_troubleshooting',
    'policy_research',
    'travel_research',
    'limited_evidence',
  ]),
  prompt: z.string().min(1),
  suites: z.array(z.enum(['smoke', 'full'])).min(1),
  expectations: z.object({
    toolUse: z.enum(['forbidden', 'required', 'optional']),
    search: z.enum(['forbidden', 'required', 'optional']),
    fetch: z.enum(['forbidden', 'required', 'optional']),
    minFetchedSources: z.number().int().nonnegative().optional(),
    maxToolCalls: z.number().int().nonnegative(),
    maxDurationMs: z.number().int().positive(),
    requiredTopics: z.array(z.string().min(1)).optional(),
    preferredSourceTypes: z.array(z.string().min(1)).optional(),
    expectedLimitations: z.array(z.string().min(1)).optional(),
    forbiddenBehaviors: z.array(z.string().min(1)),
  }),
});

// 约束每个语义评分维度同时提供分数和理由。
const scoreReasonSchema = z.object({
  score: z.number().min(1).max(5),
  reason: z.string().min(1),
});

// 校验 Judge 返回的完整离线语义评审结构。
export const semanticJudgeResultSchema = z.object({
  taskCompletion: scoreReasonSchema,
  sourceQuality: scoreReasonSchema,
  groundedness: scoreReasonSchema.extend({
    claims: z.array(
      z.object({
        claim: z.string().min(1),
        status: z.enum(['supported', 'partially_supported', 'unsupported', 'contradicted']),
        sourceIds: z.array(z.string()),
        reason: z.string().min(1),
      }),
    ),
  }),
  sourceRelevance: scoreReasonSchema,
  limitationHandling: scoreReasonSchema,
  executionEfficiency: scoreReasonSchema,
  overallScore: z.number().min(1).max(5),
  verdict: z.enum(['pass', 'limited_pass', 'fail']),
  reviewReasons: z.array(z.string()),
});
