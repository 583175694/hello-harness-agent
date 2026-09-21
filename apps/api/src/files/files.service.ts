import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  OnApplicationShutdown,
  OnModuleInit,
} from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { LOCAL_USER_ID } from '../database/local-user.bootstrap';
import { FileStorage, LocalFileStorage, type FileVariant } from '../file-storage/file-storage';
import {
  FileProcessingService,
  MAX_FILE_BYTES,
  MAX_SESSION_FILE_BYTES,
} from './file-processing.service';
import { Logger } from 'nestjs-pino';
import { describeLogError, formatLogDuration, shortLogId } from '../shared/logging.utils';
import {
  AGENT_ERROR_CODES,
  AGENT_PROTOCOL_LIMITS,
  type CreateFileInput,
  type FileReadLinesInput,
  type FileSearchInput,
} from '@harness/agent-protocol';
import { createHash } from 'node:crypto';
import {
  closeGeneratedFileRenderer,
  GeneratedFileRenderError,
  renderGeneratedFile,
} from './generated-file.renderer';

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
export class FilesService implements OnModuleInit, OnApplicationShutdown {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(FileProcessingService) private readonly processor: FileProcessingService,
    @Inject(FileStorage) private readonly storage: FileStorage,
    @Inject(Logger) private readonly logger: Logger,
  ) {}

  // 启动时收敛进程重启遗留的 processing 文件，避免状态永久悬挂。
  async onModuleInit(): Promise<void> {
    // 启动恢复时先收敛未完成解析，再补齐旧版本缺失的规范化正文。
    const processing = await this.prisma.file.findMany({
      where: { status: 'processing' },
      select: { id: true, sessionId: true, originalKey: true, origin: true },
    });
    for (const file of processing) {
      if (file.origin === 'agent_generated' || file.origin === 'tool_result') {
        try {
          await this.storage.deleteFile({ sessionId: file.sessionId, fileId: file.id });
        } catch (error) {
          await this.prisma.fileCleanupTask.upsert({
            where: { sessionId_fileId: { sessionId: file.sessionId, fileId: file.id } },
            create: {
              id: crypto.randomUUID(),
              sessionId: file.sessionId,
              fileId: file.id,
              status: 'failed',
              attempts: 1,
              lastError: describeLogError(error).slice(0, 500),
            },
            update: {
              status: 'failed',
              attempts: { increment: 1 },
              lastError: describeLogError(error).slice(0, 500),
            },
          });
        }
        await this.prisma.file.deleteMany({
          where: { id: file.id, origin: { in: ['agent_generated', 'tool_result'] } },
        });
        continue;
      }
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
    await this.backfillMissingNormalizedFiles();
  }

  async onApplicationShutdown(): Promise<void> {
    await closeGeneratedFileRenderer();
  }

  // 先在内存中完成确定性渲染，再保存原文件和规范化正文。
  async createGenerated(
    input: CreateFileInput & {
      sessionId: string;
      fileId?: string;
      signal?: AbortSignal;
    },
  ) {
    const session = await this.prisma.session.findFirst({
      where: { id: input.sessionId, userId: LOCAL_USER_ID },
    });
    if (!session)
      throw new NotFoundException({ code: 'SESSION_NOT_FOUND', detail: '会话不存在。' });
    const normalizedName = input.fileName.trim();
    let prepared: Awaited<ReturnType<typeof renderGeneratedFile>>;
    try {
      prepared = await renderGeneratedFile(input, input.signal);
    } catch (error) {
      if (error instanceof GeneratedFileRenderError) {
        throw new BadRequestException({ code: error.code, detail: error.message });
      }
      throw error;
    }
    const fileId = input.fileId ?? crypto.randomUUID();
    const now = new Date();
    await this.prisma.file.create({
      data: {
        id: fileId,
        userId: LOCAL_USER_ID,
        sessionId: input.sessionId,
        fileName: normalizedName,
        mediaType: prepared.mediaType,
        fileKind: prepared.fileKind,
        origin: 'agent_generated',
        size: prepared.buffer.length,
        sha256: createHash('sha256').update(prepared.buffer).digest('hex'),
        status: 'processing',
        processingStartedAt: now,
      },
    });
    try {
      const original = await this.storage.putOriginal({
        sessionId: input.sessionId,
        fileId,
        content: prepared.buffer,
        contentType: prepared.mediaType,
      });
      const normalized = await this.storage.putNormalized({
        sessionId: input.sessionId,
        fileId,
        content: Buffer.from(prepared.normalizedContent, 'utf8'),
        contentType: 'text/plain; charset=utf-8',
      });
      const file = await this.prisma.file.update({
        where: { id: fileId },
        data: {
          originalKey: original.objectKey,
          normalizedKey: normalized.objectKey,
          contentHash: createHash('sha256')
            .update(prepared.normalizedContent, 'utf8')
            .digest('hex'),
          parserVersion: 'c2-c-v1',
          lineCount: prepared.normalizedContent.split('\n').length,
          characterCount: [...prepared.normalizedContent].length,
          overview: { format: prepared.fileKind },
          status: 'ready',
          retryable: false,
          processingCompletedAt: new Date(),
        },
      });
      if (input.signal?.aborted) throw new DOMException('The operation was aborted.', 'AbortError');
      return this.toPublicRef(file, false);
    } catch (error) {
      try {
        await this.storage.deleteFile({ sessionId: input.sessionId, fileId });
      } catch (cleanupError) {
        await this.prisma.fileCleanupTask.upsert({
          where: { sessionId_fileId: { sessionId: input.sessionId, fileId } },
          create: {
            id: crypto.randomUUID(),
            sessionId: input.sessionId,
            fileId,
            status: 'failed',
            attempts: 1,
            lastError: describeLogError(cleanupError).slice(0, 500),
          },
          update: {
            status: 'failed',
            attempts: { increment: 1 },
            lastError: describeLogError(cleanupError).slice(0, 500),
          },
        });
        this.logger.warn(
          `生成文件对象清理失败 | 文件=${shortLogId(fileId)} | 原因=${describeLogError(cleanupError)}`,
          FilesService.name,
        );
      }
      // 未建立 Artifact 的失败 File 不对用户暴露；清理任务不依赖 File 记录存在。
      await this.prisma.file.deleteMany({ where: { id: fileId, origin: 'agent_generated' } });
      if (input.signal?.aborted || (error instanceof Error && error.name === 'AbortError')) {
        throw error;
      }
      this.logger.warn(
        `生成文件保存失败 | 文件=${shortLogId(fileId)} | 会话=${shortLogId(input.sessionId)} | 错误码=${AGENT_ERROR_CODES.fileStorageFailed} | 原因=${describeLogError(error)}`,
        FilesService.name,
      );
      throw new BadRequestException({
        code: AGENT_ERROR_CODES.fileStorageFailed,
        detail: '生成文件保存失败，请稍后重试。',
      });
    }
  }

  // 将超大 Tool Result 全文写成 Session 内 File，供 search_file / read_file_lines 回读。
  // 不走用户上传解析或 create_file 的 4 万字上限，避免回读时拿不到原文。
  async createToolResultFile(input: {
    sessionId: string;
    toolName: string;
    toolCallId: string;
    content: string;
  }): Promise<{
    fileId: string;
    fileName: string;
    lineCount: number;
    characterCount: number;
    size: number;
  }> {
    const session = await this.prisma.session.findFirst({
      where: { id: input.sessionId, userId: LOCAL_USER_ID },
    });
    if (!session)
      throw new NotFoundException({ code: 'SESSION_NOT_FOUND', detail: '会话不存在。' });
    const buffer = Buffer.from(input.content, 'utf8');
    if (buffer.length === 0 || buffer.length > MAX_FILE_BYTES)
      throw new BadRequestException({
        code: 'FILE_TOO_LARGE',
        detail: '工具结果超过文件存储上限，无法外置。',
      });
    const total = await this.prisma.file.aggregate({
      where: { sessionId: input.sessionId },
      _sum: { size: true },
    });
    if ((total._sum.size ?? 0) + buffer.length > MAX_SESSION_FILE_BYTES)
      throw new BadRequestException({
        code: 'SESSION_FILES_TOO_LARGE',
        detail: '当前会话文件总量超过 100 MiB 限制。',
      });
    const kind = detectToolResultKind(input.content);
    const fileName = toolResultFileName(input.toolName, input.toolCallId, kind.extension);
    const fileId = crypto.randomUUID();
    const now = new Date();
    const lineCount = input.content.split('\n').length;
    const characterCount = [...input.content].length;
    await this.prisma.file.create({
      data: {
        id: fileId,
        userId: LOCAL_USER_ID,
        sessionId: input.sessionId,
        fileName,
        mediaType: kind.mediaType,
        fileKind: kind.fileKind,
        origin: 'tool_result',
        size: buffer.length,
        sha256: createHash('sha256').update(buffer).digest('hex'),
        status: 'processing',
        processingStartedAt: now,
      },
    });
    try {
      const original = await this.storage.putOriginal({
        sessionId: input.sessionId,
        fileId,
        content: buffer,
        contentType: kind.mediaType,
      });
      const normalized = await this.storage.putNormalized({
        sessionId: input.sessionId,
        fileId,
        content: buffer,
        contentType: 'text/plain; charset=utf-8',
      });
      await this.prisma.file.update({
        where: { id: fileId },
        data: {
          originalKey: original.objectKey,
          normalizedKey: normalized.objectKey,
          contentHash: createHash('sha256').update(input.content, 'utf8').digest('hex'),
          parserVersion: 'tool-result-v1',
          lineCount,
          characterCount,
          overview: { format: kind.fileKind, sourceTool: input.toolName },
          status: 'ready',
          retryable: false,
          processingCompletedAt: new Date(),
        },
      });
      this.logger.log(
        `工具结果已外置为文件 | 文件=${shortLogId(fileId)} | 会话=${shortLogId(input.sessionId)} | 工具=${input.toolName} | 大小=${buffer.length} | 行数=${lineCount}`,
        FilesService.name,
      );
      return { fileId, fileName, lineCount, characterCount, size: buffer.length };
    } catch (error) {
      try {
        await this.storage.deleteFile({ sessionId: input.sessionId, fileId });
      } catch (cleanupError) {
        await this.prisma.fileCleanupTask.upsert({
          where: { sessionId_fileId: { sessionId: input.sessionId, fileId } },
          create: {
            id: crypto.randomUUID(),
            sessionId: input.sessionId,
            fileId,
            status: 'failed',
            attempts: 1,
            lastError: describeLogError(cleanupError).slice(0, 500),
          },
          update: {
            status: 'failed',
            attempts: { increment: 1 },
            lastError: describeLogError(cleanupError).slice(0, 500),
          },
        });
        this.logger.warn(
          `工具结果文件对象清理失败 | 文件=${shortLogId(fileId)} | 原因=${describeLogError(cleanupError)}`,
          FilesService.name,
        );
      }
      await this.prisma.file.deleteMany({ where: { id: fileId, origin: 'tool_result' } });
      this.logger.warn(
        `工具结果外置失败 | 文件=${shortLogId(fileId)} | 会话=${shortLogId(input.sessionId)} | 原因=${describeLogError(error)}`,
        FilesService.name,
      );
      throw new BadRequestException({
        code: AGENT_ERROR_CODES.fileStorageFailed,
        detail: '工具结果外置失败。',
      });
    }
  }

  // 恢复版本时逐字节复制已持久化的原文件和规范化正文，生成独立 File 身份。
  async cloneGeneratedFile(sourceFileId: string) {
    const source = await this.findOwned(sourceFileId);
    if (
      source.origin !== 'agent_generated' ||
      source.status !== 'ready' ||
      !source.originalKey ||
      !source.normalizedKey
    )
      throw new BadRequestException({
        code: AGENT_ERROR_CODES.fileNotReady,
        detail: '来源版本文件尚未准备好。',
      });
    const [original, normalized] = await Promise.all([
      this.storage.readObject({
        sessionId: source.sessionId,
        fileId: source.id,
        variant: 'original',
      }),
      this.storage.readObject({
        sessionId: source.sessionId,
        fileId: source.id,
        variant: 'normalized',
      }),
    ]);
    const fileId = crypto.randomUUID();
    await this.prisma.file.create({
      data: {
        id: fileId,
        userId: LOCAL_USER_ID,
        sessionId: source.sessionId,
        fileName: source.fileName,
        mediaType: source.mediaType,
        fileKind: source.fileKind,
        origin: 'agent_generated',
        size: source.size,
        sha256: source.sha256,
        status: 'processing',
        processingStartedAt: new Date(),
      },
    });
    try {
      const [savedOriginal, savedNormalized] = await Promise.all([
        this.storage.putOriginal({
          sessionId: source.sessionId,
          fileId,
          content: original.content,
          contentType: source.mediaType,
        }),
        this.storage.putNormalized({
          sessionId: source.sessionId,
          fileId,
          content: normalized.content,
          contentType: 'text/plain; charset=utf-8',
        }),
      ]);
      const file = await this.prisma.file.update({
        where: { id: fileId },
        data: {
          originalKey: savedOriginal.objectKey,
          normalizedKey: savedNormalized.objectKey,
          contentHash: source.contentHash,
          parserVersion: source.parserVersion,
          pageCount: source.pageCount,
          lineCount: source.lineCount,
          characterCount: source.characterCount,
          overview: source.overview ?? undefined,
          status: 'ready',
          retryable: false,
          processingCompletedAt: new Date(),
        },
      });
      return this.toPublicRef(file, false);
    } catch {
      try {
        await this.storage.deleteFile({ sessionId: source.sessionId, fileId });
      } catch {
        // deleteGeneratedFile 会在后续失败清理中补偿数据库记录。
      }
      await this.prisma.file.deleteMany({ where: { id: fileId } });
      throw new BadRequestException({
        code: AGENT_ERROR_CODES.fileStorageFailed,
        detail: '恢复版本文件保存失败，请稍后重试。',
      });
    }
  }

  // B.1 的 ready 文件没有 normalized_key；升级后从仍保留的原文件重建 COS 正文。
  private async backfillMissingNormalizedFiles(): Promise<void> {
    // 通过条件更新抢占单个文件，避免多个实例重复回填同一正文。
    const files = await this.prisma.file.findMany({
      where: {
        status: 'ready',
        fileKind: { not: 'image' },
        normalizedKey: null,
        originalKey: { not: null },
      },
      select: {
        id: true,
        sessionId: true,
        fileName: true,
        mediaType: true,
      },
    });
    for (const file of files) {
      const claimed = await this.prisma.file.updateMany({
        where: { id: file.id, status: 'ready', normalizedKey: null },
        data: {
          status: 'processing',
          errorCode: null,
          retryable: false,
          processingStartedAt: new Date(),
          processingCompletedAt: null,
        },
      });
      if (claimed.count === 0) continue;
      this.logger.log(
        `升级回填文件正文 | 文件=${shortLogId(file.id)} | 会话=${shortLogId(file.sessionId)}`,
        FilesService.name,
      );
      try {
        const original = await this.storage.readObject({
          sessionId: file.sessionId,
          fileId: file.id,
          variant: 'original',
        });
        await this.processInBackground(file.id, file.sessionId, {
          buffer: original.content,
          mimetype: file.mediaType,
          originalname: file.fileName,
        });
      } catch (error) {
        this.logger.warn(
          `升级回填读取原文件失败 | 文件=${shortLogId(file.id)} | 会话=${shortLogId(file.sessionId)} | 原因=${describeLogError(error)}`,
          FilesService.name,
        );
        await this.prisma.file.updateMany({
          where: { id: file.id, status: 'processing' },
          data: {
            status: 'failed',
            errorCode: AGENT_ERROR_CODES.fileStorageFailed,
            retryable: true,
            processingCompletedAt: new Date(),
          },
        });
      }
    }
  }

  // 创建文件记录、保存原文件，并异步触发文本解析。
  async upload(
    sessionId: string,
    file: { buffer: Buffer; mimetype: string; originalname: string },
  ) {
    // 先校验和落库文件身份，再写对象；文本解析不阻塞上传响应。
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
        return this.toPublicRef(saved, true);
      }
      const saved = await this.prisma.file.update({
        where: { id: fileId },
        data: { originalKey: original.objectKey },
      });
      // 先返回 processing，再由状态查询获取最终结果。
      void this.processInBackground(fileId, sessionId, file);
      return this.toPublicRef(saved, false);
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
    sessionId: string,
    file: { buffer: Buffer; mimetype: string; originalname: string },
  ): Promise<void> {
    // 后台任务只根据当前 fileId 写回状态，失败时保留原文件供重试。
    const startedAt = Date.now();
    this.logger.log(
      `文件解析开始 | 文件=${shortLogId(fileId)} | 大小=${file.buffer.length}`,
      FilesService.name,
    );
    try {
      // 解析得到规范化正文后单独保存，工具读取时不需要重新解析原文件。
      const parsed = await this.processor.parse(file);
      const normalized = await this.storage.putNormalized({
        sessionId,
        fileId,
        content: Buffer.from(parsed.normalizedContent ?? '', 'utf8'),
        contentType: 'text/plain; charset=utf-8',
      });
      await this.prisma.file.update({
        where: { id: fileId },
        data: {
          fileKind: parsed.fileKind,
          normalizedKey: normalized.objectKey,
          contentHash: parsed.contentHash,
          parserVersion: parsed.parserVersion,
          pageCount: parsed.pageCount,
          lineCount: parsed.lineCount,
          characterCount: parsed.characterCount,
          overview: parsed.overview as never,
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
    return this.toPublicRef(await this.findOwned(fileId), true);
  }

  // 从原始对象重新进入解析流程。
  async retry(fileId: string) {
    // 从原始对象恢复字节后重新进入后台解析，不信任上次失败时的临时状态。
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
    void this.processInBackground(file.id, file.sessionId, {
      buffer: object.content,
      mimetype: file.mediaType,
      originalname: file.fileName,
    });
    return this.toPublicRef({ ...file, status: 'processing', errorCode: null }, false);
  }

  // 图片返回短期地址，文本类文件从 COS 读取规范化正文供受限预览。
  async preview(fileId: string) {
    // 图片返回短期 URL，文本返回受限的规范化正文预览。
    const file = await this.findOwned(fileId);
    if (file.status !== 'ready')
      throw new BadRequestException({ code: 'FILE_NOT_READY', detail: '文件尚未准备好。' });
    if (file.fileKind !== 'image') {
      const content = await this.readNormalizedContent(file);
      return { fileId, content, contentType: 'text/plain' };
    }
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
  async findReadyForSession(
    sessionId: string,
    fileId: string,
    notFoundCode = 'ATTACHMENT_NOT_FOUND',
  ) {
    const file = await this.prisma.file.findFirst({
      where: { id: fileId, sessionId, userId: LOCAL_USER_ID },
    });
    if (!file)
      throw new NotFoundException({
        code: notFoundCode,
        detail: '附件不存在或不属于当前会话。',
      });
    if (file.errorCode === AGENT_ERROR_CODES.artifactDeleted)
      throw new BadRequestException({
        code: AGENT_ERROR_CODES.artifactDeleted,
        detail: '产物已删除。',
      });
    if (file.status !== 'ready')
      throw new BadRequestException({ code: 'FILE_NOT_READY', detail: '附件尚未准备好。' });
    return file;
  }

  // 文件工具统一通过 Session 归属、ready 和规范化正文对象三层校验。
  async searchFile(sessionId: string, input: FileSearchInput) {
    const file = await this.findReadyForSession(
      sessionId,
      input.fileId,
      AGENT_ERROR_CODES.fileNotFound,
    );
    if (file.fileKind === 'image' || !file.normalizedKey)
      throw new BadRequestException({
        code: AGENT_ERROR_CODES.fileNotReady,
        detail: '该文件没有可搜索的规范化正文。',
      });
    const content = await this.readNormalizedContent(file);
    const lines = content.split('\n');
    const maxResults = input.maxResults ?? AGENT_PROTOCOL_LIMITS.fileSearchResultsMax;
    const needle = input.query.toLocaleLowerCase();
    const matches: Array<{ lineStart: number; lineEnd: number; page?: number; text: string }> = [];
    let currentPage: number | undefined;
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index] ?? '';
      const page = line.match(/^\[\[page:(\d+)\]\]$/u);
      if (page) {
        currentPage = Number(page[1]);
        continue;
      }
      if (!line.toLocaleLowerCase().includes(needle)) continue;
      const start = Math.max(0, index - AGENT_PROTOCOL_LIMITS.fileSearchContextLines);
      const end = Math.min(lines.length - 1, index + AGENT_PROTOCOL_LIMITS.fileSearchContextLines);
      const context = lines
        .slice(start, end + 1)
        .map((text, offset) => ({ text, index: start + offset }))
        .filter(({ text }) => !/^\[\[page:(\d+)\]\]$/u.test(text));
      matches.push({
        lineStart: (context.at(0)?.index ?? index) + 1,
        lineEnd: (context.at(-1)?.index ?? index) + 1,
        ...(currentPage ? { page: currentPage } : {}),
        text: context.map((item) => item.text).join('\n'),
      });
      if (matches.length >= maxResults) break;
    }
    const totalMatches = lines.reduce(
      (count, line) =>
        count +
        (!/^\[\[page:(\d+)\]\]$/u.test(line) && line.toLocaleLowerCase().includes(needle) ? 1 : 0),
      0,
    );
    if (
      [...matches.map((match) => match.text).join('\n')].length >
      AGENT_PROTOCOL_LIMITS.fileReadResultMaxCharacters
    )
      throw new BadRequestException({
        code: AGENT_ERROR_CODES.fileSearchResultTooLarge,
        detail: '搜索结果超过单次文件工具结果限制，请缩小关键词或结果数量。',
      });
    return {
      fileId: file.id,
      fileName: file.fileName,
      mediaType: file.mediaType,
      query: input.query,
      incomplete: totalMatches > matches.length,
      matches,
    };
  }

  // 按行读取规范化正文，并为 PDF 行恢复最近的页码标记。
  async readFileLines(sessionId: string, input: FileReadLinesInput) {
    if (input.endLine - input.startLine + 1 > AGENT_PROTOCOL_LIMITS.fileReadLinesMax)
      throw new BadRequestException({
        code: AGENT_ERROR_CODES.fileReadRangeTooLarge,
        detail: `单次最多读取 ${AGENT_PROTOCOL_LIMITS.fileReadLinesMax} 行。`,
      });
    const file = await this.findReadyForSession(
      sessionId,
      input.fileId,
      AGENT_ERROR_CODES.fileNotFound,
    );
    if (file.fileKind === 'image' || !file.normalizedKey)
      throw new BadRequestException({
        code: AGENT_ERROR_CODES.fileNotReady,
        detail: '该文件没有可读取的规范化正文。',
      });
    const content = await this.readNormalizedContent(file);
    const lines = content.split('\n');
    if (input.startLine > lines.length)
      throw new BadRequestException({
        code: AGENT_ERROR_CODES.fileLineOutOfRange,
        detail: '请求的起始行超出文件范围。',
      });
    // 先截取请求范围，再过滤内部页码标记，避免把控制信息交给模型。
    const selected = lines.slice(input.startLine - 1, Math.min(input.endLine, lines.length));
    const outputLines: Array<{ line: number; page?: number; text: string }> = [];
    // 读取范围可能从 PDF 页内中间行开始，先恢复范围起点之前最近的页标记。
    let page: number | undefined;
    for (let index = 0; index < input.startLine - 1; index += 1) {
      const marker = lines[index]?.match(/^\[\[page:(\d+)\]\]$/u);
      if (marker) page = Number(marker[1]);
    }
    for (const [offset, text] of selected.entries()) {
      const absoluteLine = input.startLine + offset;
      const marker = text.match(/^\[\[page:(\d+)\]\]$/u);
      if (marker) {
        page = Number(marker[1]);
        continue;
      }
      outputLines.push({ line: absoluteLine, ...(page ? { page } : {}), text });
    }
    const characterCount = [...outputLines.map((line) => line.text).join('\n')].length;
    if (characterCount > AGENT_PROTOCOL_LIMITS.fileReadResultMaxCharacters)
      throw new BadRequestException({
        code: AGENT_ERROR_CODES.fileReadResultTooLarge,
        detail: '读取结果超过单次文件工具结果限制，请缩小行范围。',
      });
    return {
      fileId: file.id,
      fileName: file.fileName,
      mediaType: file.mediaType,
      startLine: input.startLine,
      endLine: Math.min(input.endLine, lines.length),
      incomplete: input.endLine > lines.length,
      lines: outputLines,
    };
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

  async deleteGeneratedFile(fileId: string): Promise<void> {
    const file = await this.findOwned(fileId);
    if (file.origin !== 'agent_generated') return;
    try {
      await this.storage.deleteFile({ sessionId: file.sessionId, fileId: file.id });
      await this.prisma.file.delete({ where: { id: file.id } });
    } catch (error) {
      await this.prisma.fileCleanupTask.upsert({
        where: { sessionId_fileId: { sessionId: file.sessionId, fileId: file.id } },
        create: {
          id: crypto.randomUUID(),
          sessionId: file.sessionId,
          fileId: file.id,
          status: 'failed',
          attempts: 1,
          lastError: describeLogError(error).slice(0, 500),
        },
        update: {
          status: 'failed',
          attempts: { increment: 1 },
          lastError: describeLogError(error).slice(0, 500),
        },
      });
      throw error;
    }
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
    if (file.errorCode === AGENT_ERROR_CODES.artifactDeleted)
      throw new BadRequestException({
        code: AGENT_ERROR_CODES.artifactDeleted,
        detail: '产物已删除。',
      });
    return file;
  }
  // 只有 ready 且存在原始对象的文件才能被读取。
  private async findReadyForOwner(fileId: string) {
    const file = await this.findOwned(fileId);
    if (file.status !== 'ready' || !file.originalKey)
      throw new BadRequestException({ code: 'FILE_NOT_READY', detail: '文件尚未准备好。' });
    return file;
  }

  private async readNormalizedContent(file: {
    id: string;
    sessionId: string;
    normalizedKey: string | null;
  }) {
    // 只允许读取数据库已登记的 normalized 对象，并统一转换为 UTF-8 文本。
    if (!file.normalizedKey)
      throw new BadRequestException({
        code: AGENT_ERROR_CODES.fileNotReady,
        detail: '文件正文尚未准备好。',
      });
    try {
      const result = await this.storage.readObject({
        sessionId: file.sessionId,
        fileId: file.id,
        variant: 'normalized',
      });
      return new TextDecoder('utf-8', { fatal: false }).decode(result.content);
    } catch (error) {
      this.logger.warn(
        `文件正文读取失败 | 文件=${shortLogId(file.id)} | 原因=${describeLogError(error)}`,
        FilesService.name,
      );
      throw new BadRequestException({
        code: AGENT_ERROR_CODES.fileStorageFailed,
        detail: '文件正文暂时不可读取。',
      });
    }
  }
  // 移除 COS key 等内部字段，只返回协议允许的元数据。
  toPublicRef(
    file: {
      id: string;
      fileName: string;
      mediaType: string;
      fileKind: string;
      origin?: 'user_uploaded' | 'agent_generated' | 'tool_result';
      size: number;
      width: number | null;
      height: number | null;
      status: 'processing' | 'ready' | 'failed' | 'rejected';
      errorCode: string | null;
      lineCount?: number | null;
      pageCount?: number | null;
      characterCount?: number | null;
      artifactId?: string;
    },
    includePreview: boolean,
    overrides: { artifactId?: string } = {},
  ) {
    return {
      fileId: file.id,
      fileName: file.fileName,
      mediaType: file.mediaType,
      fileKind: file.fileKind as
        'image' | 'text' | 'markdown' | 'csv' | 'json' | 'html' | 'pdf' | 'docx' | 'xlsx' | 'pptx',
      size: file.size,
      ...(file.width ? { width: file.width } : {}),
      ...(file.height ? { height: file.height } : {}),
      status: file.status,
      ...(file.errorCode ? { errorCode: file.errorCode } : {}),
      ...(file.lineCount != null ? { lineCount: file.lineCount } : {}),
      ...(file.pageCount != null ? { pageCount: file.pageCount } : {}),
      ...(file.characterCount != null ? { characterCount: file.characterCount } : {}),
      origin: file.origin ?? 'user_uploaded',
      ...((overrides.artifactId ?? file.artifactId)
        ? { artifactId: overrides.artifactId ?? file.artifactId }
        : {}),
      ...(includePreview && file.status === 'ready'
        ? { previewUrl: `/api/agent/files/${file.id}/preview` }
        : {}),
    };
  }
}

function detectToolResultKind(content: string): {
  fileKind: 'json' | 'text';
  mediaType: string;
  extension: string;
} {
  const trimmed = content.trim();
  if (
    (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
    (trimmed.startsWith('[') && trimmed.endsWith(']'))
  ) {
    try {
      JSON.parse(trimmed);
      return { fileKind: 'json', mediaType: 'application/json', extension: 'json' };
    } catch {
      // 非合法 JSON 仍按纯文本保存，避免外置失败。
    }
  }
  return { fileKind: 'text', mediaType: 'text/plain; charset=utf-8', extension: 'txt' };
}

function toolResultFileName(toolName: string, toolCallId: string, extension: string): string {
  const safeTool = toolName.replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 40) || 'tool';
  const safeCall = toolCallId.replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 16) || 'result';
  return `${safeTool}_${safeCall}.${extension}`;
}
