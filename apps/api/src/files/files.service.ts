import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { LOCAL_USER_ID } from '../database/local-user.bootstrap';
import { FileStorage, LocalFileStorage, type FileVariant } from '../file-storage/file-storage';
import { FileProcessingService, MAX_SESSION_FILE_BYTES } from './file-processing.service';
import { Logger } from 'nestjs-pino';
import { describeLogError, formatLogDuration, shortLogId } from '../shared/logging.utils';

// 内容或格式本身不可恢复的错误进入 rejected，其余错误允许重试。
const PERMANENT_PARSE_FAILURES = new Set([
  'FILE_EMPTY',
  'FILE_TOO_LARGE',
  'FILE_TYPE_UNSUPPORTED',
  'FILE_SIGNATURE_MISMATCH',
  'FILE_PARSE_FAILED',
  'FILE_CONTENT_TOO_LARGE',
  'PDF_PAGE_LIMIT_EXCEEDED',
  'PDF_TEXT_UNAVAILABLE',
]);

@Injectable()
export class FilesService implements OnModuleInit {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(FileProcessingService) private readonly processor: FileProcessingService,
    @Inject(FileStorage) private readonly storage: FileStorage,
    @Inject(Logger) private readonly logger: Logger,
  ) {}

  // 启动时收敛进程重启遗留的 processing 文件，避免状态永久悬挂。
  async onModuleInit(): Promise<void> {
    const processing = await this.prisma.file.findMany({
      where: { status: 'processing' },
      select: { id: true, sessionId: true, originalKey: true },
    });
    if (!processing.length) return;
    for (const file of processing) {
      const code = file.originalKey ? 'FILE_PARSE_TIMEOUT' : 'FILE_STORAGE_FAILED';
      await this.prisma.file.updateMany({
        where: { id: file.id, status: 'processing' },
        data: {
          status: 'failed',
          errorCode: code,
          retryable: true,
          processingCompletedAt: new Date(),
        },
      });
      this.logger.warn(
        `启动恢复遗留文件 | 文件=${shortLogId(file.id)} | 会话=${shortLogId(file.sessionId)} | 错误码=${code} | 可重试=true`,
        FilesService.name,
      );
    }
  }

  // 创建文件记录、保存原文件，并异步触发文本解析。
  async upload(
    sessionId: string,
    file: { buffer: Buffer; mimetype: string; originalname: string },
  ) {
    const session = await this.prisma.session.findFirst({
      where: { id: sessionId, userId: LOCAL_USER_ID },
    });
    if (!session)
      throw new NotFoundException({ code: 'SESSION_NOT_FOUND', detail: '会话不存在。' });
    const prepared = await this.processor.validateAndPrepare(file);
    // 会话总容量按原始文件大小统计。
    const total = await this.prisma.file.aggregate({ where: { sessionId }, _sum: { size: true } });
    if ((total._sum.size ?? 0) + file.buffer.length > MAX_SESSION_FILE_BYTES)
      throw new BadRequestException({
        code: 'SESSION_FILES_TOO_LARGE',
        detail: '当前会话文件总量超过 100 MiB 限制。',
      });
    const fileId = crypto.randomUUID();
    await this.prisma.file.create({
      data: {
        id: fileId,
        userId: LOCAL_USER_ID,
        sessionId,
        fileName: prepared.fileName,
        mediaType: prepared.mediaType,
        fileKind: prepared.fileKind,
        size: prepared.size,
        sha256: prepared.sha256,
        width: prepared.width ?? null,
        height: prepared.height ?? null,
        status: 'processing',
        processingStartedAt: new Date(),
      },
    });
    this.logger.log(
      `文件已进入解析队列 | 文件=${shortLogId(fileId)} | 会话=${shortLogId(sessionId)} | 类型=${prepared.fileKind} | 大小=${prepared.size}`,
      FilesService.name,
    );
    try {
      const original = await this.storage.putOriginal({
        sessionId,
        fileId,
        content: file.buffer,
        contentType: prepared.mediaType,
      });
      if (prepared.fileKind === 'image' && prepared.preview && prepared.previewType) {
        // 图片保留同步 ready 路径，文本类文件走后台解析。
        const preview = await this.storage.putPreview({
          sessionId,
          fileId,
          content: prepared.preview,
          contentType: prepared.previewType,
        });
        const saved = await this.prisma.file.update({
          where: { id: fileId },
          data: {
            originalKey: original.objectKey,
            previewKey: preview.objectKey,
            status: 'ready',
            processingCompletedAt: new Date(),
          },
        });
        return this.toRef(saved, true);
      }
      const saved = await this.prisma.file.update({
        where: { id: fileId },
        data: { originalKey: original.objectKey },
      });
      // 先返回 processing，再由状态查询获取最终结果。
      void this.processInBackground(fileId, file);
      return this.toRef(saved, false);
    } catch (error) {
      this.logger.error(
        `文件保存失败 | 文件=${shortLogId(fileId)} | 会话=${shortLogId(sessionId)} | 原因=${describeLogError(error)}`,
        FilesService.name,
      );
      try {
        await this.storage.deleteFile({ sessionId, fileId });
      } catch (cleanupError) {
        this.logger.warn(
          `文件保存失败后的对象清理失败 | 文件=${shortLogId(fileId)} | 原因=${describeLogError(cleanupError)}`,
          FilesService.name,
        );
      }
      try {
        await this.prisma.file.update({
          where: { id: fileId },
          data: {
            status: 'failed',
            errorCode: 'FILE_STORAGE_FAILED',
            retryable: true,
            processingCompletedAt: new Date(),
          },
        });
      } catch (updateError) {
        this.logger.error(
          `文件保存失败状态写回失败 | 文件=${shortLogId(fileId)} | 原因=${describeLogError(updateError)}`,
          FilesService.name,
        );
      }
      throw new BadRequestException({
        code: 'FILE_STORAGE_FAILED',
        detail: '文件保存失败，请稍后重试。',
      });
    }
  }

  // 在 API 进程内解析文件，并写回 ready、failed 或 rejected。
  private async processInBackground(
    fileId: string,
    file: { buffer: Buffer; mimetype: string; originalname: string },
  ): Promise<void> {
    const startedAt = Date.now();
    this.logger.log(
      `文件解析开始 | 文件=${shortLogId(fileId)} | 大小=${file.buffer.length}`,
      FilesService.name,
    );
    try {
      const parsed = await this.processor.parse(file);
      await this.prisma.file.update({
        where: { id: fileId },
        data: {
          fileKind: parsed.fileKind,
          normalizedContent: parsed.normalizedContent,
          contentHash: parsed.contentHash,
          parserVersion: parsed.parserVersion,
          pageCount: parsed.pageCount,
          lineCount: parsed.lineCount,
          characterCount: parsed.characterCount,
          overview: parsed.overview as Prisma.InputJsonValue,
          locations: parsed.locations as Prisma.InputJsonValue,
          status: 'ready',
          retryable: false,
          errorCode: null,
          processingCompletedAt: new Date(),
        },
      });
      this.logger.log(
        `文件解析完成 | 文件=${shortLogId(fileId)} | 状态=ready | 耗时=${formatLogDuration(Date.now() - startedAt)} | 字符=${parsed.characterCount ?? 0} | 页数=${parsed.pageCount ?? 0}`,
        FilesService.name,
      );
    } catch (error) {
      const response = error instanceof BadRequestException ? error.getResponse() : undefined;
      const code =
        typeof response === 'object' &&
        response !== null &&
        'code' in response &&
        typeof response.code === 'string'
          ? response.code
          : 'FILE_PARSE_FAILED';
      // 永久错误不展示重试入口，临时错误保留原文件等待重试。
      const retryable = !PERMANENT_PARSE_FAILURES.has(code);
      const status = retryable ? 'failed' : 'rejected';
      this.logger.warn(
        `文件解析失败 | 文件=${shortLogId(fileId)} | 状态=${status} | 错误码=${code} | 可重试=${retryable} | 耗时=${formatLogDuration(Date.now() - startedAt)} | 原因=${describeLogError(error)}`,
        FilesService.name,
      );
      try {
        await this.prisma.file.update({
          where: { id: fileId },
          data: { status, errorCode: code, retryable, processingCompletedAt: new Date() },
        });
      } catch (updateError) {
        this.logger.error(
          `文件解析失败状态写回失败 | 文件=${shortLogId(fileId)} | 错误码=${code} | 原因=${describeLogError(updateError)}`,
          FilesService.name,
        );
      }
    }
  }

  // 返回脱敏后的公共文件引用。
  async get(fileId: string) {
    return this.toRef(await this.findOwned(fileId), true);
  }

  // 从原始对象重新进入解析流程。
  async retry(fileId: string) {
    const file = await this.findOwned(fileId);
    if (!file.retryable || !file.originalKey)
      throw new BadRequestException({ code: 'FILE_NOT_RETRYABLE', detail: '该文件当前不可重试。' });
    this.logger.log(
      `文件解析重试 | 文件=${shortLogId(file.id)} | 会话=${shortLogId(file.sessionId)}`,
      FilesService.name,
    );
    let object;
    try {
      object = await this.storage.readObject({
        sessionId: file.sessionId,
        fileId: file.id,
        variant: 'original',
      });
    } catch (error) {
      this.logger.warn(
        `文件解析重试读取失败 | 文件=${shortLogId(file.id)} | 会话=${shortLogId(file.sessionId)} | 阶段=read_original | 错误码=FILE_STORAGE_FAILED | 原因=${describeLogError(error)}`,
        FilesService.name,
      );
      throw new BadRequestException({
        code: 'FILE_STORAGE_FAILED',
        detail: '文件读取失败，请稍后重试。',
      });
    }
    await this.prisma.file.update({
      where: { id: file.id },
      data: { status: 'processing', errorCode: null, processingStartedAt: new Date() },
    });
    void this.processInBackground(file.id, {
      buffer: object.content,
      mimetype: file.mediaType,
      originalname: file.fileName,
    });
    return this.toRef({ ...file, status: 'processing', errorCode: null }, false);
  }

  // 图片返回短期地址，文本类文件返回规范化正文。
  async preview(fileId: string) {
    const file = await this.findOwned(fileId);
    if (file.status !== 'ready')
      throw new BadRequestException({ code: 'FILE_NOT_READY', detail: '文件尚未准备好。' });
    if (file.fileKind !== 'image')
      return { fileId, content: file.normalizedContent ?? '', contentType: 'text/plain' };
    if (!file.previewKey)
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

  // 消息绑定前校验文件归属和 ready 状态。
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

  // 只删除未绑定消息的文件，存储失败时登记补偿任务。
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
    try {
      await this.storage.deleteFile({ sessionId: file.sessionId, fileId: file.id });
    } catch (error) {
      const lastError = describeLogError(error).slice(0, 500);
      try {
        await this.prisma.fileCleanupTask.upsert({
          where: { sessionId_fileId: { sessionId: file.sessionId, fileId: file.id } },
          create: {
            id: crypto.randomUUID(),
            sessionId: file.sessionId,
            fileId: file.id,
            status: 'failed',
            attempts: 1,
            lastError,
          },
          update: { status: 'failed', attempts: { increment: 1 }, lastError },
        });
      } catch (taskError) {
        this.logger.error(
          `文件删除补偿任务写入失败 | 文件=${shortLogId(file.id)} | 原因=${describeLogError(taskError)}`,
          FilesService.name,
        );
      }
      this.logger.warn(
        `文件删除失败，已进入补偿 | 文件=${shortLogId(file.id)} | 会话=${shortLogId(file.sessionId)} | 原因=${lastError}`,
        FilesService.name,
      );
      throw new BadRequestException({
        code: 'FILE_STORAGE_FAILED',
        detail: '文件删除失败，系统将自动重试清理。',
      });
    }
    await this.prisma.file.delete({ where: { id: file.id } });
    return { deletedFileId: file.id };
  }

  // 为模型适配器生成原文件短期读取地址。
  async readUrl(file: { id: string; sessionId: string }) {
    return this.storage.createReadUrl({
      sessionId: file.sessionId,
      fileId: file.id,
      variant: 'original',
    });
  }
  // 通过 fileId 校验归属后生成读取地址。
  async readUrlById(fileId: string) {
    const file = await this.findReadyForOwner(fileId);
    return this.readUrl(file);
  }

  // 本地存储专用读取路径，生产 COS 不经过这里。
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

  // 查询当前用户拥有的文件。
  private async findOwned(fileId: string) {
    const file = await this.prisma.file.findFirst({ where: { id: fileId, userId: LOCAL_USER_ID } });
    if (!file) throw new NotFoundException({ code: 'FILE_NOT_FOUND', detail: '文件不存在。' });
    return file;
  }
  // 只有 ready 且存在原始对象的文件才能被读取。
  private async findReadyForOwner(fileId: string) {
    const file = await this.findOwned(fileId);
    if (file.status !== 'ready' || !file.originalKey)
      throw new BadRequestException({ code: 'FILE_NOT_READY', detail: '文件尚未准备好。' });
    return file;
  }
  // 移除 COS key 等内部字段，只返回协议允许的元数据。
  private toRef(
    file: {
      id: string;
      fileName: string;
      mediaType: string;
      fileKind: string;
      size: number;
      width: number | null;
      height: number | null;
      status: 'processing' | 'ready' | 'failed' | 'rejected';
      errorCode: string | null;
    },
    includePreview: boolean,
  ) {
    return {
      fileId: file.id,
      fileName: file.fileName,
      mediaType: file.mediaType,
      fileKind: file.fileKind,
      size: file.size,
      ...(file.width ? { width: file.width } : {}),
      ...(file.height ? { height: file.height } : {}),
      status: file.status,
      ...(file.errorCode ? { errorCode: file.errorCode } : {}),
      ...(includePreview && file.status === 'ready'
        ? { previewUrl: `/api/agent/files/${file.id}/preview` }
        : {}),
    };
  }
}
