import { z } from 'zod';

// 文件从上传、解析到可用或失败的生命周期状态。
export const fileProcessingStatusSchema = z.enum(['processing', 'ready', 'failed', 'rejected']);
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
    .enum(['image', 'text', 'markdown', 'csv', 'json', 'pdf', 'docx', 'xlsx', 'pptx'])
    .optional(),
  lineCount: z.number().int().nonnegative().optional(),
  pageCount: z.number().int().nonnegative().optional(),
  characterCount: z.number().int().nonnegative().optional(),
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
export type UserImageContent = z.infer<typeof userImageContentSchema>;
export type UserFileContent = z.infer<typeof userFileContentSchema>;
export type UserContentBlock = z.infer<typeof userContentBlockSchema>;
export type FileRef = z.infer<typeof fileRefSchema>;
export type FileSearchInput = z.infer<typeof fileSearchInputSchema>;
export type FileSearchResult = z.infer<typeof fileSearchResultSchema>;
export type FileReadLinesInput = z.infer<typeof fileReadLinesInputSchema>;
export type FileReadLinesResult = z.infer<typeof fileReadLinesResultSchema>;
