import { HttpException, Injectable } from '@nestjs/common';
import {
  AGENT_ERROR_CODES,
  AGENT_PROTOCOL_LIMITS,
  AGENT_TOOL_NAMES,
  fileReadInputSchema,
  fileReadResultSchema,
  type FileReadInput,
  type FileReadResult,
} from '@harness/agent-protocol';
import { FilesService } from '../files/files.service';
import type { AgentTool, ToolExecutionContext, ToolExecutionResult } from './agent-tool.types';

@Injectable()
export class FileReadTool implements AgentTool<FileReadInput, FileReadResult> {
  readonly name = AGENT_TOOL_NAMES.readFile;
  readonly inputSchema = fileReadInputSchema;
  readonly inputErrorCode = AGENT_ERROR_CODES.invalidToolArguments;
  readonly executionPolicy = { timeoutMs: 5_000, approval: 'auto_execute' } as const;

  constructor(private readonly files: FilesService) {}

  definition() {
    const maxLines = AGENT_PROTOCOL_LIMITS.fileReadLinesMax;
    return {
      name: this.name,
      description:
        '读取当前会话中已准备好的文件内容。包括用户附件、Agent 生成文件，以及外置的超大工具结果。' +
        ' scope=file：小文件返回全文，大文件返回 outline（lineCount、sections[]、可选 head/tail），不要从第 1 行机械扫到末尾。' +
        ' scope=section：按 sectionId 读取整段（来自 outline.sections）；散文/论文/docx 等长文优先用 section 逐段读，不要只用随意 lines 窗口（如中间某几行）代替读稿。' +
        ' scope=lines：日志/代码/表格，或 section 过大时的续读；若必须用 lines 覆盖全文，按 1..lineCount 分块、块间不重叠遗漏，单次最多 ' +
        `${maxLines} 行。` +
        ' 任务需要全文理解/审阅/查矛盾时：先 scope=file，再按 sections 读完或用 lines 覆盖全部行号；未覆盖前不要对用户声称已读全文。' +
        ' 上下文若只有 [Tool Result stored: …] / [Tool Result truncated: …]，必须对本条中的 fileId 再调 read_file 取正文，不要把说明当内容。' +
        ' 定位关键词先用 search_file，再用 read_file（section 或 lines）读命中附近正文。',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          fileId: { type: 'string', minLength: 1, description: '要读取的文件 fileId。' },
          scope: {
            type: 'string',
            enum: ['file', 'section', 'lines'],
            description:
              'file=结构或小文全文；section=按 outline 读章节/段落块（长文首选）；lines=按行号精读或分块覆盖全文。',
          },
          sectionId: {
            type: 'string',
            minLength: 1,
            description: 'scope=section 时必填，来自 outline.sections[].sectionId。',
          },
          startLine: {
            type: 'integer',
            minimum: 1,
            description: 'scope=lines 时必填，起始行（含）。',
          },
          endLine: {
            type: 'integer',
            minimum: 1,
            description: `scope=lines 时必填，结束行（含）；范围不超过 ${maxLines} 行。`,
          },
        },
        required: ['fileId', 'scope'],
      },
    };
  }

  isAvailable(): boolean {
    return true;
  }

  async execute(
    input: FileReadInput,
    context: ToolExecutionContext,
  ): Promise<ToolExecutionResult<FileReadResult>> {
    try {
      const output = fileReadResultSchema.parse(
        await this.files.readFile(context.userId, context.sessionId, input),
      );
      if (output.scope === 'file') {
        return {
          status: 'succeeded',
          output,
          logFields: { scope: output.scope, 档位: output.sizeTier, 不完整: output.incomplete },
        };
      }
      return {
        status: 'succeeded',
        output,
        logFields: { scope: output.scope, 行数: output.lines.length, 不完整: output.incomplete },
      };
    } catch (error) {
      const response = error instanceof HttpException ? error.getResponse() : undefined;
      const code = this.responseCode(response) ?? AGENT_ERROR_CODES.fileStorageFailed;
      const detail = this.responseDetail(response) ?? '文件读取暂时不可用。';
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
    return typeof response === 'object' &&
      response !== null &&
      'code' in response &&
      typeof response.code === 'string'
      ? response.code
      : undefined;
  }

  private responseDetail(response: unknown): string | undefined {
    return typeof response === 'object' &&
      response !== null &&
      'detail' in response &&
      typeof response.detail === 'string'
      ? response.detail
      : undefined;
  }
}
