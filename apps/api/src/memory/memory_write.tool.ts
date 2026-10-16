import { Inject, Injectable } from '@nestjs/common';
import { z } from 'zod';
import { AGENT_TOOL_NAMES } from '@harness/agent-protocol';
import { MEMORY_KINDS } from './memory.constants';
import { MemoryConfigService } from './memory.config';
import { MemoryService } from './memory.service';
import type { AgentTool, ToolExecutionContext, ToolExecutionResult } from '../tools/agent-tool.types';
import type { MemoryWriteOutput } from './memory.types';

const inputSchema = z
  .object({
    action: z.enum(['create', 'update', 'delete']),
    memoryId: z.string().min(1).optional(),
    title: z.string().min(1).optional(),
    content: z.string().min(1).optional(),
    kind: z.enum(MEMORY_KINDS).optional(),
    storageIntent: z.enum(['explicit', 'inferred']).optional(),
    confidence: z.enum(['low', 'medium', 'high']).optional(),
  })
  .strict();

@Injectable()
export class MemoryWriteTool implements AgentTool<z.infer<typeof inputSchema>, MemoryWriteOutput> {
  readonly name = AGENT_TOOL_NAMES.memoryWrite;
  readonly inputSchema = inputSchema;
  readonly executionPolicy = { timeoutMs: 30_000, approval: 'auto_execute' } as const;

  constructor(
    @Inject(MemoryService) private readonly memory: MemoryService,
    @Inject(MemoryConfigService) private readonly config: MemoryConfigService,
  ) {}

  definition() {
    return {
      name: this.name,
      description:
        '写入、更新或删除用户的长期记忆。修订同一事实（更正、刷新、替换旧内容）时必须 action=update，并带上 system 块 <user_memory> 或上一轮本工具返回的 memoryId；不要为同一事实换标题再 create。用户首次明确「请记住」或稳定自述时用 create。删除用 delete 且必填 memoryId。不要写入搜索结果、一次性任务结论或密钥。',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          action: { type: 'string', enum: ['create', 'update', 'delete'] },
          memoryId: {
            type: 'string',
            description: 'update/delete 必填；来自 <memory id="..."> 或上次 memory_write 的 memoryId',
          },
          title: { type: 'string', description: 'create/update 必填，≤80 字；修订事实时尽量保持标题稳定' },
          content: { type: 'string', description: 'create/update 必填，注入主文案，≤500 字' },
          kind: { type: 'string', enum: [...MEMORY_KINDS] },
          storageIntent: { type: 'string', enum: ['explicit', 'inferred'] },
          confidence: { type: 'string', enum: ['low', 'medium', 'high'] },
        },
        required: ['action'],
      },
    };
  }

  isAvailable(): boolean {
    return this.config.writeEnabled;
  }

  async execute(
    input: z.infer<typeof inputSchema>,
    context: ToolExecutionContext,
  ): Promise<ToolExecutionResult<MemoryWriteOutput>> {
    const output = await this.memory.writeFromTool(
      context.userId,
      {
        sessionId: context.sessionId,
        runId: context.runId,
        messageId: context.messageId,
        toolCallId: context.toolCallId,
        userUtterance: context.latestUserMessage,
      },
      input,
    );
    if (!output.ok) {
      return {
        status: 'succeeded',
        output,
      };
    }
    return { status: 'succeeded', output };
  }
}
