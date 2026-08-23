import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { AGENT_TOOL_NAMES } from '@harness/agent-protocol';
import type { AgentTool, ToolExecutionResult } from './agent-tool.types';

const inputSchema = z.object({}).strict();
export type CurrentTimeResult = {
  iso: string;
  date: string;
  time: string;
  timezone: 'Asia/Shanghai';
};

@Injectable()
export class GetCurrentTimeTool implements AgentTool<Record<string, never>, CurrentTimeResult> {
  readonly name = AGENT_TOOL_NAMES.getCurrentTime;
  readonly inputSchema = inputSchema;
  readonly executionPolicy = { timeoutMs: 1_000, approval: 'auto_execute' } as const;

  definition() {
    return {
      name: this.name,
      description: '获取当前日期和时间。涉及今天、昨天、明天或相对日期时使用。',
      parameters: { type: 'object', additionalProperties: false, properties: {}, required: [] },
    };
  }

  isAvailable(): boolean {
    return true;
  }

  async execute(): Promise<ToolExecutionResult<CurrentTimeResult>> {
    const now = new Date();
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Shanghai',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }).formatToParts(now);
    const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    const date = `${values.year}-${values.month}-${values.day}`;
    const time = `${values.hour}:${values.minute}:${values.second}`;
    return {
      status: 'succeeded',
      output: { iso: now.toISOString(), date, time, timezone: 'Asia/Shanghai' },
    };
  }
}
