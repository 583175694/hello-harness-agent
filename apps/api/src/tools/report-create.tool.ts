/* eslint-disable @typescript-eslint/no-explicit-any */
import { HttpException, Injectable } from '@nestjs/common';
import {
  AGENT_ERROR_CODES,
  AGENT_PROTOCOL_LIMITS,
  AGENT_TOOL_NAMES,
  createReportInputSchema,
  createReportResultSchema,
  type CreateReportInput,
  type CreateReportResult,
} from '@harness/agent-protocol';
import { ArtifactsService } from '../artifacts/artifacts.service';
import type { AgentTool, ToolExecutionContext, ToolExecutionResult } from './agent-tool.types';

@Injectable()
export class ReportCreateTool implements AgentTool<CreateReportInput, CreateReportResult> {
  readonly name = AGENT_TOOL_NAMES.createReport;
  readonly inputSchema = createReportInputSchema;
  readonly inputErrorCode = AGENT_ERROR_CODES.invalidToolArguments;
  readonly executionPolicy = { timeoutMs: 10_000, approval: 'auto_execute' } as const;
  constructor(private readonly artifacts: ArtifactsService) {}
  definition() {
    return {
      name: this.name,
      description:
        '创建一份可独立阅读、可保存和后续复用的正式 Markdown 报告。对用户整体意图判断为一项或多项正式交付物时使用；同一运行可以多次调用，每次创建一份独立报告。不要仅因内容较长而使用，也不要把完整报告正文直接放在最终聊天回复中。必须提供标题、摘要和完整正文。正文保持精炼，不要把推理过程整段搬进 content。调用成功后，最终回复只需概括结论并提示用户打开报告。可关联网页来源和当前会话材料。',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          title: { type: 'string' },
          summary: { type: 'string' },
          fileName: { type: 'string', description: '仅 .md 文件名' },
          content: {
            type: 'string',
            description: `精炼 Markdown 正文，最多 ${AGENT_PROTOCOL_LIMITS.createReportMaxCodePoints} 个 Unicode 字符，不要写入推理过程`,
          },
          sourceIds: { type: 'array', items: { type: 'string' }, maxItems: 50 },
          fileIds: { type: 'array', items: { type: 'string' }, maxItems: 50 },
        },
        required: ['title', 'summary', 'fileName', 'content'],
      },
    };
  }
  isAvailable() {
    return true;
  }
  async execute(
    input: CreateReportInput,
    context: ToolExecutionContext,
  ): Promise<ToolExecutionResult<CreateReportResult>> {
    if (!context.runId)
      return {
        status: 'failed',
        error: {
          code: AGENT_ERROR_CODES.toolUnavailable,
          detail: '报告缺少运行上下文。',
          retryable: false,
        },
      };
    try {
      const output = createReportResultSchema.parse(
        await this.artifacts.createReport({
          ...input,
          sessionId: context.sessionId,
          runId: context.runId,
          toolCallId: context.toolCallId,
        }),
      );
      return {
        status: 'succeeded',
        output,
        logFields: { 报告标题: input.title },
      };
    } catch (error) {
      const response = error instanceof HttpException ? error.getResponse() : undefined;
      const code =
        typeof response === 'object' && response && typeof (response as any).code === 'string'
          ? (response as any).code
          : AGENT_ERROR_CODES.reportValidationFailed;
      const detail =
        typeof response === 'object' && response && typeof (response as any).detail === 'string'
          ? (response as any).detail
          : '创建报告失败。';
      return { status: 'failed', error: { code, detail, retryable: false, cause: error } };
    }
  }
}
