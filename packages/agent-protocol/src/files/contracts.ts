import { z } from 'zod';

export const fileProcessingStatusSchema = z.enum(['processing', 'ready', 'failed', 'rejected']);
// canonical 图片内容只携带服务端稳定的文件 ID，URL 和 object key 延迟到
// Model Adapter 发送请求时再解析。
export const userImageContentSchema = z.object({
  type: z.literal('image_ref'),
  fileId: z.string().min(1),
  detail: z.literal('auto').optional(),
});
export const userTextContentSchema = z.object({ type: z.literal('text'), text: z.string() });
export const userContentBlockSchema = z.discriminatedUnion('type', [
  userTextContentSchema,
  userImageContentSchema,
]);
// 这是暴露给 Web 客户端的文件元数据，不包含 COS 凭据或永久对象地址。
export const fileRefSchema = z.object({
  fileId: z.string().min(1),
  fileName: z.string().min(1),
  mediaType: z.string().min(1),
  size: z.number().int().nonnegative(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  status: fileProcessingStatusSchema,
  errorCode: z.string().min(1).optional(),
  previewUrl: z.string().min(1).optional(),
});

export type FileProcessingStatus = z.infer<typeof fileProcessingStatusSchema>;
export type UserImageContent = z.infer<typeof userImageContentSchema>;
export type UserContentBlock = z.infer<typeof userContentBlockSchema>;
export type FileRef = z.infer<typeof fileRefSchema>;
