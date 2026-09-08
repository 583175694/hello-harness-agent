import { HttpException, Injectable } from '@nestjs/common';
import {
  AGENT_ERROR_CODES,
  AGENT_PROTOCOL_LIMITS,
  AGENT_TOOL_NAMES,
  fileSearchInputSchema,
  fileSearchResultSchema,
  type FileSearchInput,
  type FileSearchResult,
} from '@harness/agent-protocol';
import { FilesService } from '../files/files.service';
import type { AgentTool, ToolExecutionContext, ToolExecutionResult } from './agent-tool.types';

@Injectable()
export class FileSearchTool implements AgentTool<FileSearchInput, FileSearchResult> {
  readonly name = AGENT_TOOL_NAMES.searchFile;
  readonly inputSchema = fileSearchInputSchema;
  readonly inputErrorCode = AGENT_ERROR_CODES.invalidToolArguments;
  readonly executionPolicy = { timeoutMs: 5_000, approval: 'auto_execute' } as const;

  // 文件搜索委托 FilesService 处理归属校验、状态校验和正文读取。
  constructor(private readonly files: FilesService) {}

  // 返回供模型调用的搜索工具声明。
  definition() {
    return {
      name: this.name,
      description: '在用户已附加且已准备好的文件中搜索普通关键词，返回有限命中和行号/页码上下文。',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          fileId: { type: 'string', minLength: 1, description: '要搜索的附件 fileId。' },
          query: {
            type: 'string',
            minLength: 1,
            maxLength: AGENT_PROTOCOL_LIMITS.fileSearchQueryMaxLength,
            description: '普通关键词，不支持正则表达式、JSONPath 或复杂查询语法。',
          },
          maxResults: {
            type: 'integer',
            minimum: 1,
            maximum: AGENT_PROTOCOL_LIMITS.fileSearchResultsMax,
          },
        },
        required: ['fileId', 'query'],
      },
    };
  }

  // 文件搜索不依赖外部 Provider，始终可用。
  isAvailable(): boolean {
    return true;
  }

  async execute(
    input: FileSearchInput,
    context: ToolExecutionContext,
  ): Promise<ToolExecutionResult<FileSearchResult>> {
    // 将业务异常转换为 Tool Result，避免单次搜索错误直接打断 Run。
    try {
      const output = fileSearchResultSchema.parse(
        await this.files.searchFile(context.sessionId, input),
      );
      return {
        status: 'succeeded',
        output,
        logFields: { 命中: output.matches.length, 不完整: output.incomplete },
      };
    } catch (error) {
      return this.failure(error);
    }
  }

  private failure(error: unknown): ToolExecutionResult<FileSearchResult> {
    // 将搜索异常映射为稳定错误码和可重试标记。
    const response = error instanceof HttpException ? error.getResponse() : undefined;
    const code = this.responseCode(response) ?? AGENT_ERROR_CODES.fileStorageFailed;
    const detail = this.responseDetail(response) ?? '文件搜索暂时不可用。';
    return {
      status: 'failed',
      error: {
        code,
        detail,
        retryable: code === AGENT_ERROR_CODES.fileStorageFailed,
        cause: error,
      },
    };
  }

  private responseCode(response: unknown): string | undefined {
    // 从 Nest 异常响应中提取机器可读错误码。
    return typeof response === 'object' &&
      response !== null &&
      'code' in response &&
      typeof response.code === 'string'
      ? response.code
      : undefined;
  }

  private responseDetail(response: unknown): string | undefined {
    // 从 Nest 异常响应中提取用户可读错误详情。
    return typeof response === 'object' &&
      response !== null &&
      'detail' in response &&
      typeof response.detail === 'string'
      ? response.detail
      : undefined;
  }
}
