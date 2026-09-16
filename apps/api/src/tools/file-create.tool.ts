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
  readonly executionPolicy = { timeoutMs: 30_000, approval: 'auto_execute' } as const;

  constructor(private readonly artifacts: ArtifactsService) {}

  definition() {
    return {
      name: this.name,
      description:
        `创建一个真实格式的文件交付物。支持 TXT、Markdown、JSON、HTML、PDF、DOCX 和 XLSX。` +
        ` HTML、PDF 和 DOCX 的 content 必须是 Markdown，不是 HTML、XML、Base64 或文件路径，最多 ${AGENT_PROTOCOL_LIMITS.generatedFileMaxCodePoints} 个 Unicode 字符；` +
        ` XLSX 必须使用 sheets/rows，最多 ${AGENT_PROTOCOL_LIMITS.generatedWorkbookMaxSheets} 个 Sheet、每个 Sheet ${AGENT_PROTOCOL_LIMITS.generatedWorkbookMaxRowsPerSheet} 行、总计 ${AGENT_PROTOCOL_LIMITS.generatedWorkbookMaxCells} 个单元格。` +
        ' 文件名只能是普通文件名；一次调用只生成一个文件，不能覆盖、追加或写入工作区文件。',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          fileName: { type: 'string', minLength: 1, maxLength: 255 },
          content: { type: 'string', minLength: 1 },
          sheets: {
            type: 'array',
            maxItems: AGENT_PROTOCOL_LIMITS.generatedWorkbookMaxSheets,
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                name: { type: 'string', maxLength: 31 },
                rows: {
                  type: 'array',
                  maxItems: AGENT_PROTOCOL_LIMITS.generatedWorkbookMaxRowsPerSheet,
                  items: {
                    type: 'array',
                    items: { type: ['string', 'number', 'boolean', 'null'] },
                  },
                },
              },
              required: ['name', 'rows'],
            },
          },
        },
        required: ['fileName'],
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
        error: {
          code: AGENT_ERROR_CODES.toolUnavailable,
          detail: '生成文件缺少运行上下文。',
          retryable: false,
        },
      };
    }
    try {
      const output = createFileResultSchema.parse(
        await this.artifacts.create({
          sessionId: context.sessionId,
          runId: context.runId,
          toolCallId: context.toolCallId,
          fileName: input.fileName,
          ...(input.content !== undefined ? { content: input.content } : {}),
          ...(input.sheets !== undefined ? { sheets: input.sheets } : {}),
          signal: context.signal,
        }),
      );
      return {
        status: 'succeeded',
        output,
        logFields: { 文件大小: output.file.size, 文件类型: output.file.fileKind ?? 'unknown' },
      };
    } catch (error) {
      if (context.signal?.aborted || (error instanceof Error && error.name === 'AbortError')) {
        return {
          status: 'cancelled',
          error: {
            code: AGENT_ERROR_CODES.toolCancelled,
            detail: '生成文件已取消。',
            retryable: true,
            cause: error,
          },
        };
      }
      const response = error instanceof HttpException ? error.getResponse() : undefined;
      const code = this.responseField(response, 'code') ?? AGENT_ERROR_CODES.artifactStorageFailed;
      const detail = this.responseField(response, 'detail') ?? '生成文件失败。';
      return {
        status: 'failed',
        error: {
          code,
          detail,
          retryable: code === AGENT_ERROR_CODES.artifactStorageFailed,
          cause: error,
        },
      };
    }
  }

  private responseField(response: unknown, field: 'code' | 'detail'): string | undefined {
    if (typeof response !== 'object' || response === null) return undefined;
    const value = (response as Record<string, unknown>)[field];
    return typeof value === 'string' ? value : undefined;
  }
}
