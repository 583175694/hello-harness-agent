import { z } from 'zod';

export const fileProcessingStatusSchema = z.enum(['processing', 'ready', 'failed', 'rejected']);
// canonical 图片内容只携带服务端稳定的文件 ID，URL 和 object key 延迟到
// Model Adapter 发送请求时再解析。
export const userImageContentSchema = z.object({
  type: z.literal('image_ref'),
  fileId: z.string().min(1),
  detail: z.literal('auto').optional(),
});
export const userFileContentSchema = z.object({
  // 客户端只提交稳定 fileId，正文由服务端恢复。
  type: z.literal('file_ref'),
  fileId: z.string().min(1),
});
export const userTextContentSchema = z.object({ type: z.literal('text'), text: z.string() });
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
  fileKind: z.enum(['image', 'text', 'markdown', 'csv', 'json', 'pdf']).optional(),
});

export type FileProcessingStatus = z.infer<typeof fileProcessingStatusSchema>;
export type UserImageContent = z.infer<typeof userImageContentSchema>;
export type UserFileContent = z.infer<typeof userFileContentSchema>;
export type UserContentBlock = z.infer<typeof userContentBlockSchema>;
export type FileRef = z.infer<typeof fileRefSchema>;
