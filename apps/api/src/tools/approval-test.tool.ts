import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { AGENT_TOOL_NAMES } from '@harness/agent-protocol';
import type { AgentTool, ToolExecutionResult } from './agent-tool.types';

const inputSchema = z.object({ message: z.string().trim().min(1).max(500) }).strict();

@Injectable()
export class ApprovalTestTool implements AgentTool<{ message: string }, { echoed: string }> {
  readonly name = AGENT_TOOL_NAMES.approvalTest;
  readonly inputSchema = inputSchema;
  readonly executionPolicy = { timeoutMs: 5_000, approval: 'require_approval' } as const;

  definition() {
    return {
      name: this.name,
      description: '执行一个无副作用的确认测试。仅在用户明确要求测试人工审批流程时使用。',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: { message: { type: 'string', maxLength: 500 } },
        required: ['message'],
      },
    };
  }

  isAvailable(): boolean {
    return true;
  }

  async execute(input: { message: string }): Promise<ToolExecutionResult<{ echoed: string }>> {
    return { status: 'succeeded', output: { echoed: input.message } };
  }
}
