import { HttpException, Injectable } from '@nestjs/common';
import {
  AGENT_ERROR_CODES,
  AGENT_PROTOCOL_LIMITS,
  AGENT_TOOL_NAMES,
  createFileInputSchema,
  createFileResultSchema,
  type CreateFileInput,
  type CreateFileResult,
} from '@harness/agent-protocol';
import { ArtifactsService } from '../artifacts/artifacts.service';
import type { AgentTool, ToolExecutionContext, ToolExecutionResult } from './agent-tool.types';

@Injectable()
export class FileCreateTool implements AgentTool<CreateFileInput, CreateFileResult> {
  readonly name = AGENT_TOOL_NAMES.createFile;
  readonly inputSchema = createFileInputSchema;
  readonly inputErrorCode = AGENT_ERROR_CODES.invalidToolArguments;
  readonly executionPolicy = { timeoutMs: 10_000, approval: 'auto_execute' } as const;

  constructor(private readonly artifacts: ArtifactsService) {}

  definition() {
    return {
      name: this.name,
      description:
        `创建一个新的文本文件交付物。支持 TXT、Markdown 和 JSON；内容必须一次性完整提供，最多 ${AGENT_PROTOCOL_LIMITS.generatedFileMaxCodePoints} 个 Unicode 字符。` +
        ' 文件名只能是普通文件名，不能包含路径；不能覆盖、追加或写入工作区文件。',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          fileName: { type: 'string', minLength: 1, maxLength: 255 },
          content: { type: 'string', minLength: 1 },
        },
        required: ['fileName', 'content'],
      },
    };
  }

  isAvailable(): boolean {
    return true;
  }

  async execute(
    input: CreateFileInput,
    context: ToolExecutionContext,
  ): Promise<ToolExecutionResult<CreateFileResult>> {
    if (!context.runId) {
      return {
        status: 'failed',
        error: { code: AGENT_ERROR_CODES.toolUnavailable, detail: '生成文件缺少运行上下文。', retryable: false },
      };
    }
    try {
      const output = createFileResultSchema.parse(
        await this.artifacts.create({
          sessionId: context.sessionId,
          runId: context.runId,
          toolCallId: context.toolCallId,
          fileName: input.fileName,
          content: input.content,
        }),
      );
      return {
        status: 'succeeded',
        output,
        logFields: { 文件大小: output.file.size, 文件类型: output.file.fileKind ?? 'unknown' },
      };
    } catch (error) {
      const response = error instanceof HttpException ? error.getResponse() : undefined;
      const code = this.responseField(response, 'code') ?? AGENT_ERROR_CODES.artifactStorageFailed;
      const detail = this.responseField(response, 'detail') ?? '生成文件失败。';
      return {
        status: 'failed',
        error: { code, detail, retryable: code === AGENT_ERROR_CODES.artifactStorageFailed, cause: error },
      };
    }
  }

  private responseField(response: unknown, field: 'code' | 'detail'): string | undefined {
    if (typeof response !== 'object' || response === null) return undefined;
    const value = (response as Record<string, unknown>)[field];
    return typeof value === 'string'
      ? value
      : undefined;
  }
}
