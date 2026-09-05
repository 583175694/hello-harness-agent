import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { LOCAL_USER_ID } from '../database/local-user.bootstrap';
import { FileStorage, LocalFileStorage, type FileVariant } from '../file-storage/file-storage';
import { FileProcessingService } from './file-processing.service';

@Injectable()
export class FilesService {
  /** 注入数据库、图片处理器和独立存储实现。 */
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(FileProcessingService) private readonly processor: FileProcessingService,
    @Inject(FileStorage) private readonly storage: FileStorage,
  ) {}

  async upload(
    sessionId: string,
    file: { buffer: Buffer; mimetype: string; originalname: string },
  ) {
    // A0 有意采用同步上传：只有原图和预览图都写入成功后，文件才允许被消息绑定。
    const session = await this.prisma.session.findFirst({
      where: { id: sessionId, userId: LOCAL_USER_ID },
    });
    if (!session)
      throw new NotFoundException({ code: 'SESSION_NOT_FOUND', detail: '会话不存在。' });
    const processed = await this.processor.process(file);
    const fileId = crypto.randomUUID();
    await this.prisma.file.create({
      data: {
        id: fileId,
        userId: LOCAL_USER_ID,
        sessionId,
        fileName: processed.fileName,
        mediaType: processed.mediaType,
        size: processed.size,
        sha256: processed.sha256,
        width: processed.width,
        height: processed.height,
        status: 'processing',
      },
    });
    try {
      const original = await this.storage.putOriginal({
        sessionId,
        fileId,
        content: file.buffer,
        contentType: processed.mediaType,
      });
      const preview = await this.storage.putPreview({
        sessionId,
        fileId,
        content: processed.preview,
        contentType: processed.previewType,
      });
      const saved = await this.prisma.file.update({
        where: { id: fileId },
        data: { originalKey: original.objectKey, previewKey: preview.objectKey, status: 'ready' },
      });
      return this.toRef(saved, true);
    } catch {
      // 如果第二次写入失败，先清理可能已经存在的第一个对象；数据库仍是事实来源，
      // 即使对象清理不可用，也要将文件标记为失败。
      try {
        await this.storage.deleteFile({ sessionId, fileId });
      } catch {
        // 尽力清理；后续生命周期清理可以再次处理该对象。
      }
      try {
        await this.prisma.file.update({
          where: { id: fileId },
          data: { status: 'failed', errorCode: 'FILE_STORAGE_FAILED', retryable: true },
        });
      } catch {
        // 即使失败标记无法持久化（例如数据库故障），也要保留稳定的上传错误。
      }
      throw new BadRequestException({
        code: 'FILE_STORAGE_FAILED',
        detail: '文件保存失败，请稍后重试。',
      });
    }
  }

  /** 校验文件归属并返回一次性生成的预览跳转地址。 */
  async preview(fileId: string) {
    // 控制器只在请求发生时跳转，因此签名 URL 不会写入 File、Message、transcript
    // 或 Web 会话数据。
    const file = await this.findOwned(fileId);
    if (file.status !== 'ready' || !file.previewKey)
      throw new BadRequestException({ code: 'FILE_NOT_READY', detail: '文件尚未准备好。' });
    return {
      fileId,
      url: await this.storage.createReadUrl({
        sessionId: file.sessionId,
        fileId,
        variant: 'preview',
      }),
    };
  }

  /** 校验附件属于当前 Session 且已完成处理，供 Run 创建使用。 */
  async findReadyForSession(sessionId: string, fileId: string) {
    const file = await this.prisma.file.findFirst({
      where: { id: fileId, sessionId, userId: LOCAL_USER_ID },
    });
    if (!file)
      throw new NotFoundException({
        code: 'ATTACHMENT_NOT_FOUND',
        detail: '附件不存在或不属于当前会话。',
      });
    if (file.status !== 'ready')
      throw new BadRequestException({ code: 'FILE_NOT_READY', detail: '附件尚未准备好。' });
    return file;
  }

  /** 删除尚未绑定消息的文件及其对象；已发送附件不可变且不能删除。 */
  async deleteUnbound(fileId: string): Promise<{ deletedFileId: string }> {
    const file = await this.prisma.file.findFirst({
      where: { id: fileId, userId: LOCAL_USER_ID },
      include: { attachments: { select: { id: true } } },
    });
    if (!file) throw new NotFoundException({ code: 'FILE_NOT_FOUND', detail: '文件不存在。' });
    if (file.attachments.length)
      throw new ConflictException({
        code: 'FILE_ALREADY_ATTACHED',
        detail: '已发送的附件不能删除。',
      });
    await this.storage.deleteFile({ sessionId: file.sessionId, fileId: file.id });
    await this.prisma.file.delete({ where: { id: file.id } });
    return { deletedFileId: file.id };
  }

  /** 按稳定文件事实生成原图读取地址，供 Adapter 临时调用。 */
  async readUrl(file: { id: string; sessionId: string }) {
    return this.storage.createReadUrl({
      sessionId: file.sessionId,
      fileId: file.id,
      variant: 'original',
    });
  }

  /** 查询当前用户的 ready 文件并生成原图读取地址。 */
  async readUrlById(fileId: string) {
    const file = await this.findReadyForOwner(fileId);
    return this.readUrl(file);
  }

  /** 为本地存储路由读取已就绪文件内容，COS 不经过此路径。 */
  async localContent(fileId: string, variant: FileVariant) {
    const file = await this.findReadyForOwner(fileId);
    if (!(this.storage instanceof LocalFileStorage))
      throw new NotFoundException({ code: 'FILE_NOT_FOUND', detail: '文件内容不存在。' });
    const result = await this.storage.readObject({
      sessionId: file.sessionId,
      fileId: file.id,
      variant,
    });
    return { ...result, contentType: variant === 'preview' ? 'image/webp' : file.mediaType };
  }

  /** 查询当前固定用户拥有的文件，统一处理不存在错误。 */
  private async findOwned(fileId: string) {
    const file = await this.prisma.file.findFirst({ where: { id: fileId, userId: LOCAL_USER_ID } });
    if (!file) throw new NotFoundException({ code: 'FILE_NOT_FOUND', detail: '文件不存在。' });
    return file;
  }

  /** 查询可供预览或模型读取的已就绪文件。 */
  private async findReadyForOwner(fileId: string) {
    const file = await this.findOwned(fileId);
    if (file.status !== 'ready' || !file.originalKey)
      throw new BadRequestException({ code: 'FILE_NOT_READY', detail: '文件尚未准备好。' });
    return file;
  }

  /** 将数据库文件记录转换为不暴露对象 key 的公共附件引用。 */
  private toRef(
    file: {
      id: string;
      fileName: string;
      mediaType: string;
      size: number;
      width: number;
      height: number;
      status: 'processing' | 'ready' | 'failed' | 'rejected';
      errorCode: string | null;
    },
    includePreview: boolean,
  ) {
    return {
      fileId: file.id,
      fileName: file.fileName,
      mediaType: file.mediaType,
      size: file.size,
      width: file.width,
      height: file.height,
      status: file.status,
      ...(file.errorCode ? { errorCode: file.errorCode } : {}),
      ...(includePreview ? { previewUrl: `/api/agent/files/${file.id}/preview` } : {}),
    };
  }
}
