import { HttpException, Injectable } from '@nestjs/common';
import {
  AGENT_ERROR_CODES,
  AGENT_PROTOCOL_LIMITS,
  AGENT_TOOL_NAMES,
  fileReadLinesInputSchema,
  fileReadLinesResultSchema,
  type FileReadLinesInput,
  type FileReadLinesResult,
} from '@harness/agent-protocol';
import { FilesService } from '../files/files.service';
import type { AgentTool, ToolExecutionContext, ToolExecutionResult } from './agent-tool.types';

@Injectable()
export class FileReadLinesTool implements AgentTool<FileReadLinesInput, FileReadLinesResult> {
  readonly name = AGENT_TOOL_NAMES.readFileLines;
  readonly inputSchema = fileReadLinesInputSchema;
  readonly inputErrorCode = AGENT_ERROR_CODES.invalidToolArguments;
  readonly executionPolicy = { timeoutMs: 5_000, approval: 'auto_execute' } as const;

  // 行读取工具通过 FilesService 复用文件归属、状态和范围校验。
  constructor(private readonly files: FilesService) {}

  // 返回供模型调用的按范围读取工具声明。
  definition() {
    return {
      name: this.name,
      description:
        `读取用户已附加文件的指定行范围，返回文件名、fileId、行号和 PDF 页码。` +
        ` startLine 和 endLine 都是包含边界；单次最多读取 ${AGENT_PROTOCOL_LIMITS.fileReadLinesMax} 行。` +
        ` 如果需要更大范围，必须拆成多次调用，例如读取第 1-100 行时调用 1-50、51-100；不要提交超过上限的单次范围。`,
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          fileId: { type: 'string', minLength: 1, description: '要读取的附件 fileId。' },
          startLine: {
            type: 'integer',
            minimum: 1,
            description: '起始行号，包含该行；大范围读取时从上一次结束行的下一行继续。',
          },
          endLine: {
            type: 'integer',
            minimum: 1,
            description:
              `结束行号，包含该行；endLine - startLine + 1 必须不超过 ${AGENT_PROTOCOL_LIMITS.fileReadLinesMax}。`,
          },
        },
        required: ['fileId', 'startLine', 'endLine'],
      },
    };
  }

  // 行读取只访问服务端已解析正文，不依赖外部 Provider。
  isAvailable(): boolean {
    return true;
  }

  async execute(
    input: FileReadLinesInput,
    context: ToolExecutionContext,
  ): Promise<ToolExecutionResult<FileReadLinesResult>> {
    // 将读取结果校验后包装成统一的 Tool Result。
    try {
      const output = fileReadLinesResultSchema.parse(
        await this.files.readFileLines(context.sessionId, input),
      );
      return {
        status: 'succeeded',
        output,
        logFields: { 行数: output.lines.length, 不完整: output.incomplete },
      };
    } catch (error) {
      const response = error instanceof HttpException ? error.getResponse() : undefined;
      const code = this.responseCode(response) ?? AGENT_ERROR_CODES.fileStorageFailed;
      const detail = this.responseDetail(response) ?? '文件行读取暂时不可用。';
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
