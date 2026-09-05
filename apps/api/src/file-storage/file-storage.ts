import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import COS from 'cos-nodejs-sdk-v5';

export type FileVariant = 'original' | 'preview';

// 存储模块只负责对象读写和临时读取地址；校验、归属、消息绑定和文件状态
// 仍由 files 模块负责。
export abstract class FileStorage {
  /** 写入不可变的原始图片对象。 */
  abstract putOriginal(input: {
    sessionId: string;
    fileId: string;
    content: Buffer;
    contentType: string;
  }): Promise<{ objectKey: string; etag?: string }>;
  /** 写入供预览使用的缩略图对象。 */
  abstract putPreview(input: {
    sessionId: string;
    fileId: string;
    content: Buffer;
    contentType: string;
  }): Promise<{ objectKey: string }>;
  /** 在真正预览或发送前生成短期读取地址。 */
  abstract createReadUrl(input: {
    sessionId: string;
    fileId: string;
    variant: FileVariant;
  }): Promise<string>;
  /** 删除文件对应的原图和预览图对象。 */
  abstract deleteFile(input: { sessionId: string; fileId: string }): Promise<void>;
}

@Injectable()
export class LocalFileStorage extends FileStorage {
  private readonly objects = new Map<string, Buffer>();

  /** 将原图写入内存对象表，供本地开发和测试使用。 */
  async putOriginal(input: {
    sessionId: string;
    fileId: string;
    content: Buffer;
    contentType: string;
  }) {
    const objectKey = `sessions/${input.sessionId}/files/${input.fileId}/original`;
    this.objects.set(objectKey, input.content);
    return { objectKey };
  }

  /** 将预览图写入内存对象表，供本地开发和测试使用。 */
  async putPreview(input: {
    sessionId: string;
    fileId: string;
    content: Buffer;
    contentType: string;
  }) {
    const objectKey = `sessions/${input.sessionId}/files/${input.fileId}/preview`;
    this.objects.set(objectKey, input.content);
    return { objectKey };
  }

  /** 返回本地内容路由，不伪造外部可访问的 COS 地址。 */
  async createReadUrl(input: { sessionId: string; fileId: string; variant: FileVariant }) {
    // 本地实现只作为开发和测试替身；使用相对地址以跟随 API 实际监听地址。
    return `/api/agent/files/${input.fileId}/content/${input.variant}`;
  }

  /** 从内存对象表读取本地预览或原图内容。 */
  async readObject(input: { sessionId: string; fileId: string; variant: FileVariant }) {
    // 内存读取路径只服务本地预览和测试；生产 Adapter 使用 COS 签名 URL，
    // 不需要通过 Nest 读取文件字节。
    const key = `sessions/${input.sessionId}/files/${input.fileId}/${input.variant}`;
    const content = this.objects.get(key);
    if (!content) throw new Error('LocalFileNotFound');
    return { content, contentType: input.variant === 'preview' ? 'image/webp' : undefined };
  }

  /** 删除本地对象表中的原图和预览图。 */
  async deleteFile(input: { sessionId: string; fileId: string }) {
    for (const variant of ['original', 'preview'] as const)
      this.objects.delete(`sessions/${input.sessionId}/files/${input.fileId}/${variant}`);
  }
}

@Injectable()
export class CosFileStorage extends FileStorage {
  private readonly client: COS;
  private readonly bucket: string;
  private readonly region: string;

  // 从 ConfigService 读取 COS 配置，密钥不进入模型消息或日志。
  constructor(@Inject(ConfigService) config: ConfigService) {
    super();
    this.bucket = config.get<string>('COS_BUCKET') ?? '';
    this.region = config.get<string>('COS_REGION') ?? '';
    this.client = new COS({
      SecretId: config.get<string>('COS_SECRET_ID') ?? '',
      SecretKey: config.get<string>('COS_SECRET_KEY') ?? '',
    });
  }

  /** 使用腾讯云 COS 写入原始图片。 */
  async putOriginal(input: {
    sessionId: string;
    fileId: string;
    content: Buffer;
    contentType: string;
  }): Promise<{ objectKey: string; etag?: string }> {
    const objectKey = this.key(input.sessionId, input.fileId, 'original');
    const result = await this.client.putObject({
      Bucket: this.bucket,
      Region: this.region,
      Key: objectKey,
      Body: input.content,
      ContentType: input.contentType,
    });
    return { objectKey, etag: result.ETag };
  }

  /** 使用腾讯云 COS 写入预览缩略图。 */
  async putPreview(input: {
    sessionId: string;
    fileId: string;
    content: Buffer;
    contentType: string;
  }): Promise<{ objectKey: string }> {
    const objectKey = this.key(input.sessionId, input.fileId, 'preview');
    await this.client.putObject({
      Bucket: this.bucket,
      Region: this.region,
      Key: objectKey,
      Body: input.content,
      ContentType: input.contentType,
    });
    return { objectKey };
  }

  /** 为 COS 私有对象生成五分钟有效的签名读取地址。 */
  async createReadUrl(input: {
    sessionId: string;
    fileId: string;
    variant: FileVariant;
  }): Promise<string> {
    return this.client.getObjectUrl({
      Bucket: this.bucket,
      Region: this.region,
      Key: this.key(
        input.sessionId,
        input.fileId,
        input.variant === 'original' ? 'original' : 'preview',
      ),
      Sign: true,
      Expires: 300,
    });
  }

  /** 删除 COS 中同一文件的原图和预览图。 */
  async deleteFile(input: { sessionId: string; fileId: string }): Promise<void> {
    await Promise.all(
      (['original', 'preview'] as const).map((variant) =>
        this.client.deleteObject({
          Bucket: this.bucket,
          Region: this.region,
          Key: this.key(input.sessionId, input.fileId, variant),
        }),
      ),
    );
  }

  /** 按 Session、文件和版本生成服务端控制的对象 key。 */
  private key(sessionId: string, fileId: string, variant: 'original' | 'preview'): string {
    return `sessions/${sessionId}/files/${fileId}/${variant}`;
  }
}
