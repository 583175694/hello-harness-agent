import { z } from 'zod';
import { AGENT_PROTOCOL_LIMITS } from '../common/constants.js';

// 文件从上传、解析到可用或失败的生命周期状态。
export const fileProcessingStatusSchema = z.enum(['processing', 'ready', 'failed', 'rejected']);
export const fileOriginSchema = z.enum(['user_uploaded', 'agent_generated', 'tool_result']);
// canonical 图片内容只携带服务端稳定的文件 ID，URL 和 object key 延迟到
// Model Adapter 发送请求时再解析。
export const userImageContentSchema = z.object({
  type: z.literal('image_ref'),
  fileId: z.string().min(1),
  detail: z.literal('auto').optional(),
});
// 用户消息中的文本文件引用，只保留元数据，正文由文件工具按需读取。
export const userFileContentSchema = z.object({
  // 客户端只提交稳定 fileId，正文由服务端恢复。
  type: z.literal('file_ref'),
  fileId: z.string().min(1),
  fileName: z.string().min(1),
  mediaType: z.string().min(1),
  size: z.number().int().nonnegative(),
  lineCount: z.number().int().nonnegative().optional(),
  pageCount: z.number().int().nonnegative().optional(),
  // 仅为旧 C1-B.1 客户端解码保留的兼容字段；服务端新链路不会生成或持久化它。
  content: z.string().optional(),
});
// 用户消息中的普通文本块。
export const userTextContentSchema = z.object({ type: z.literal('text'), text: z.string() });
// 用户消息允许出现的文本、图片引用和文件引用。
export const userContentBlockSchema = z.discriminatedUnion('type', [
  userTextContentSchema,
  userImageContentSchema,
  userFileContentSchema,
]);
// 这是暴露给 Web 客户端的文件元数据，不包含 COS 凭据或永久对象地址。
export const fileRefSchema = z.object({
  fileId: z.string().min(1),
  fileName: z.string().min(1),
  mediaType: z.string().min(1),
  size: z.number().int().nonnegative(),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  status: fileProcessingStatusSchema,
  errorCode: z.string().min(1).optional(),
  previewUrl: z.string().min(1).optional(),
  // 兼容已有图片数据，因此文件类型允许缺省。
  fileKind: z
    .enum(['image', 'text', 'markdown', 'csv', 'json', 'html', 'pdf', 'docx', 'xlsx', 'pptx'])
    .optional(),
  lineCount: z.number().int().nonnegative().optional(),
  pageCount: z.number().int().nonnegative().optional(),
  characterCount: z.number().int().nonnegative().optional(),
  origin: fileOriginSchema.optional(),
  artifactId: z.string().min(1).optional(),
});

export const artifactStatusSchema = z.enum(['processing', 'ready', 'failed', 'deleted']);
export const artifactOperationSchema = z.enum(['create', 'revise', 'restore']);
export const artifactRefSchema = z.object({
  artifactId: z.string().min(1),
  fileId: z.string().min(1),
  fileName: z.string().min(1),
  mediaType: z.string().min(1),
  fileKind: z.enum(['text', 'markdown', 'json', 'html', 'pdf', 'docx', 'xlsx', 'image']),
  size: z.number().int().nonnegative(),
  status: artifactStatusSchema,
  createdAt: z.string().datetime(),
  // 兼容 C2-D 上线前已经持久化在消息 metadata 中的 Artifact block。
  seriesId: z.string().min(1).optional(),
  logicalName: z.string().min(1).optional(),
  versionNumber: z.number().int().positive().optional(),
  runId: z.string().min(1).optional(),
  operation: artifactOperationSchema.optional(),
  isCurrent: z.boolean().optional(),
  parentArtifactId: z.string().min(1).optional(),
  sourceArtifactId: z.string().min(1).optional(),
  changeSummary: z.string().min(1).optional(),
  errorCode: z.string().min(1).optional(),
  lineCount: z.number().int().nonnegative().optional(),
  characterCount: z.number().int().nonnegative().optional(),
});

export const artifactSeriesRefSchema = z.object({
  seriesId: z.string().min(1),
  sessionId: z.string().min(1),
  logicalName: z.string().min(1),
  currentArtifactId: z.string().min(1).nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  versions: z.array(artifactRefSchema),
});

export const restoreArtifactRequestSchema = z
  .object({
    expectedCurrentArtifactId: z.string().min(1),
    idempotencyKey: z.string().min(1).max(200),
  })
  .strict();

export const restoreArtifactResultSchema = z.object({
  artifact: artifactRefSchema,
  file: fileRefSchema,
  series: artifactSeriesRefSchema,
});

export const createFileInputSchema = z
  .object({
    fileName: z.string().trim().min(1).max(255),
    content: z.string().min(1).optional(),
    sheets: z
      .array(
        z
          .object({
            name: z.string().max(31),
            rows: z.array(
              z.array(z.union([z.string(), z.number().finite(), z.boolean(), z.null()])),
            ),
          })
          .strict(),
      )
      .max(AGENT_PROTOCOL_LIMITS.generatedWorkbookMaxSheets)
      .optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (
      /[\\/]/u.test(value.fileName) ||
      value.fileName.includes(String.fromCharCode(0)) ||
      value.fileName === '.' ||
      value.fileName === '..'
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['fileName'],
        message: 'invalid file name',
      });
      return;
    }
    const ext = value.fileName.toLowerCase().split('.').pop() ?? '';
    const workbook = ext === 'xlsx';
    if (!/\.(?:md|markdown|txt|json|html|pdf|docx|xlsx)$/iu.test(value.fileName)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['fileName'],
        message: 'unsupported file extension',
      });
    }
    if (
      workbook
        ? !value.sheets?.length || value.content !== undefined
        : !value.content || value.sheets !== undefined
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: [workbook ? 'sheets' : 'content'],
        message: workbook
          ? 'xlsx requires non-empty sheets and no content'
          : 'document requires non-empty content and no sheets',
      });
    }
    if (!workbook && value.content && [...value.content].length > 40_000) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['content'],
        message: 'content exceeds code point limit',
      });
    }
    if (
      !workbook &&
      value.content &&
      new TextEncoder().encode(value.content).byteLength > 10 * 1024 * 1024
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['content'],
        message: 'content exceeds byte limit',
      });
    }
    if (/\.json$/iu.test(value.fileName) && value.content) {
      try {
        JSON.parse(value.content);
      } catch {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['content'],
          message: 'invalid JSON content',
        });
      }
    }
    if (workbook && value.sheets) {
      let totalCells = 0;
      for (const [sheetIndex, sheet] of value.sheets.entries()) {
        if (sheet.rows.length > AGENT_PROTOCOL_LIMITS.generatedWorkbookMaxRowsPerSheet) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['sheets', sheetIndex, 'rows'],
            message: 'sheet exceeds row limit',
          });
        }
        for (const [rowIndex, row] of sheet.rows.entries()) {
          totalCells += row.length;
          for (const [cellIndex, cell] of row.entries()) {
            if (
              typeof cell === 'string' &&
              [...cell].length > AGENT_PROTOCOL_LIMITS.generatedWorkbookMaxCellCodePoints
            ) {
              context.addIssue({
                code: z.ZodIssueCode.custom,
                path: ['sheets', sheetIndex, 'rows', rowIndex, cellIndex],
                message: 'cell exceeds code point limit',
              });
            }
          }
        }
      }
      if (totalCells > AGENT_PROTOCOL_LIMITS.generatedWorkbookMaxCells) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['sheets'],
          message: 'workbook exceeds cell limit',
        });
      }
    }
  });
// 工具事件和持久化快照只保存生成请求摘要，绝不携带完整正文。
export const createFileInputSummarySchema = z.union([
  z
    .object({
      inputType: z.literal('document').default('document'),
      fileName: z.string().min(1).max(255),
      contentCharacterCount: z.number().int().nonnegative(),
      contentByteCount: z.number().int().nonnegative(),
    })
    .strict(),
  z
    .object({
      inputType: z.literal('workbook'),
      fileName: z.string().min(1).max(255),
      sheetCount: z.number().int().nonnegative(),
      totalRowCount: z.number().int().nonnegative(),
      totalCellCount: z.number().int().nonnegative(),
    })
    .strict(),
]);
export const createFileResultSchema = z.object({
  artifact: artifactRefSchema,
  file: fileRefSchema,
});

// 文件搜索工具的输入约束。
export const fileSearchInputSchema = z
  .object({
    fileId: z.string().min(1),
    query: z.string().trim().min(1).max(500),
    maxResults: z.number().int().positive().max(8).optional(),
  })
  .strict();

// 文件搜索工具返回的有限命中结果。
export const fileSearchResultSchema = z.object({
  fileId: z.string().min(1),
  fileName: z.string().min(1),
  mediaType: z.string().min(1),
  query: z.string().min(1),
  incomplete: z.boolean(),
  matches: z.array(
    z.object({
      lineStart: z.number().int().positive(),
      lineEnd: z.number().int().positive(),
      page: z.number().int().positive().optional(),
      text: z.string().min(1),
    }),
  ),
});

// 文件行读取工具的输入约束，限制单次读取范围。
export const fileReadLinesInputSchema = z
  .object({
    fileId: z.string().min(1),
    startLine: z.number().int().positive(),
    endLine: z.number().int().positive(),
  })
  .strict()
  .refine((value) => value.endLine >= value.startLine, {
    message: 'endLine must be greater than or equal to startLine',
  })
  .refine((value) => value.endLine - value.startLine + 1 <= 50, {
    message: 'line range is too large',
  });

// 文件行读取工具返回的带行号和可选页码的内容。
export const fileReadLinesResultSchema = z.object({
  fileId: z.string().min(1),
  fileName: z.string().min(1),
  mediaType: z.string().min(1),
  startLine: z.number().int().positive(),
  endLine: z.number().int().positive(),
  incomplete: z.boolean(),
  lines: z.array(
    z.object({
      line: z.number().int().positive(),
      page: z.number().int().positive().optional(),
      text: z.string(),
    }),
  ),
});

export type FileProcessingStatus = z.infer<typeof fileProcessingStatusSchema>;
export type FileOrigin = z.infer<typeof fileOriginSchema>;
export type UserImageContent = z.infer<typeof userImageContentSchema>;
export type UserFileContent = z.infer<typeof userFileContentSchema>;
export type UserContentBlock = z.infer<typeof userContentBlockSchema>;
export type FileRef = z.infer<typeof fileRefSchema>;
export type ArtifactStatus = z.infer<typeof artifactStatusSchema>;
export type ArtifactOperation = z.infer<typeof artifactOperationSchema>;
export type ArtifactRef = z.infer<typeof artifactRefSchema>;
export type ArtifactSeriesRef = z.infer<typeof artifactSeriesRefSchema>;
export type RestoreArtifactRequest = z.infer<typeof restoreArtifactRequestSchema>;
export type RestoreArtifactResult = z.infer<typeof restoreArtifactResultSchema>;
export type CreateFileInput = z.infer<typeof createFileInputSchema>;
export type CreateFileInputSummary = z.infer<typeof createFileInputSummarySchema>;
export type CreateFileResult = z.infer<typeof createFileResultSchema>;

export const reportStatusSchema = z.enum(['ready', 'deleted']);
export const reportRefSchema = z.object({
  reportId: z.string().min(1),
  artifactId: z.string().min(1),
  runId: z.string().min(1),
  title: z.string().min(1),
  summary: z.string().min(1),
  sourceIds: z.array(z.string().min(1)),
  fileIds: z.array(z.string().min(1)),
  status: reportStatusSchema,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export const createReportInputSchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    summary: z.string().trim().min(1).max(1000),
    fileName: z.string().trim().min(1).max(255),
    content: z.string().min(1),
    sourceIds: z.array(z.string().min(1)).max(50).optional(),
    fileIds: z.array(z.string().min(1)).max(50).optional(),
  })
  .strict()
  .superRefine((v, c) => {
    if (!/^[^\\/\0]+\.md$/iu.test(v.fileName) || v.fileName === '.' || v.fileName === '..')
      c.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['fileName'],
        message: 'invalid markdown file name',
      });
    if ([...v.content].length > AGENT_PROTOCOL_LIMITS.createReportMaxCodePoints)
      c.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['content'],
        message: 'content exceeds code point limit',
      });
    if (/<\/?(?:script|iframe|object|embed|style)\b|data:text\/html|javascript:/iu.test(v.content))
      c.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['content'],
        message: 'unsafe markdown content',
      });
    for (const key of ['sourceIds', 'fileIds'] as const)
      if (new Set(v[key] ?? []).size !== (v[key] ?? []).length)
        c.addIssue({ code: z.ZodIssueCode.custom, path: [key], message: 'duplicate ids' });
  });
export const createReportResultSchema = z.object({
  report: reportRefSchema,
  artifact: artifactRefSchema,
  file: fileRefSchema,
});
export const createReportInputSummarySchema = z.object({
  title: z.string().min(1),
  summary: z.string().min(1),
  fileName: z.string().min(1),
  sourceIds: z.array(z.string()).optional(),
  fileIds: z.array(z.string()).optional(),
  contentCharacterCount: z.number().int().nonnegative(),
  contentByteCount: z.number().int().nonnegative(),
});
export type ReportRef = z.infer<typeof reportRefSchema>;
export type CreateReportInput = z.infer<typeof createReportInputSchema>;
export type CreateReportResult = z.infer<typeof createReportResultSchema>;
export type CreateReportInputSummary = z.infer<typeof createReportInputSummarySchema>;
export type FileSearchInput = z.infer<typeof fileSearchInputSchema>;
export type FileSearchResult = z.infer<typeof fileSearchResultSchema>;
export type FileReadLinesInput = z.infer<typeof fileReadLinesInputSchema>;
export type FileReadLinesResult = z.infer<typeof fileReadLinesResultSchema>;
