import { AGENT_TOOL_NAMES } from '@harness/agent-protocol';
import type { AgentToolDefinition } from './agent-tool.types';

// 内置 Function Calling 工具只提供模型声明；具体执行逻辑由 Agent Runtime 分派。
const UPDATE_PLAN_TOOL_DEFINITION: AgentToolDefinition = {
  name: AGENT_TOOL_NAMES.updatePlan,
  description:
    'Updates the task plan. Use this for complex, multi-step, or tool-assisted tasks. Provide an optional explanation and a list of plan items, each with a step and status. At most one step can be in_progress at a time.',
  parameters: {
    type: 'object',
    properties: {
      explanation: { type: 'string' },
      plan: {
        type: 'array',
        description: 'The list of steps',
        items: {
          type: 'object',
          properties: {
            step: { type: 'string' },
            status: {
              type: 'string',
              description: 'One of: pending, in_progress, completed',
              enum: ['pending', 'in_progress', 'completed'],
            },
          },
          additionalProperties: false,
          required: ['step', 'status'],
        },
      },
    },
    additionalProperties: false,
    required: ['plan'],
  },
};

// 返回当前 Runtime 可注入模型请求的内置工具，便于后续按能力继续扩展。
export function builtinToolDefinitions(): AgentToolDefinition[] {
  return [UPDATE_PLAN_TOOL_DEFINITION];
}
