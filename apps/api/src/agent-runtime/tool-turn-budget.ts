import {
  AGENT_ERROR_CODES,
  AGENT_PROTOCOL_LIMITS,
  AGENT_TOOL_NAMES,
} from '@harness/agent-protocol';
import type { AgentToolDefinition } from '../tools/agent-tool.types';

export type ToolPhase = 'investigation' | 'delivery' | 'final_only';

const DELIVERY_PHASE_TOOL_NAMES = new Set<string>([
  AGENT_TOOL_NAMES.createFile,
  AGENT_TOOL_NAMES.createReport,
]);

export const INVESTIGATION_DELIVERY_SYSTEM_NOTICE =
  '调查阶段 Tool Turn 已用尽。进入交付阶段：仅可使用 create_file 与 create_report 生成交付物；不得再调用 read_file、web_search、web_fetch 等调查类工具。请基于已有材料完成交付或直接输出最终回答。';

/** 业务 tool call 是否计入当前 phase 的 Tool Turn（update_plan 除外）。 */
export function countsTowardToolTurn(toolName: string): boolean {
  return toolName !== AGENT_TOOL_NAMES.updatePlan;
}

export function isToolAllowedInPhase(toolName: string, phase: ToolPhase): boolean {
  if (toolName === AGENT_TOOL_NAMES.updatePlan) return phase !== 'final_only';
  if (phase === 'investigation') return true;
  if (phase === 'delivery') return DELIVERY_PHASE_TOOL_NAMES.has(toolName);
  return false;
}

export function filterToolDefinitionsForPhase(
  definitions: AgentToolDefinition[],
  phase: ToolPhase,
): AgentToolDefinition[] | undefined {
  if (phase === 'final_only') return undefined;
  if (phase === 'investigation') return definitions;
  return definitions.filter((definition) => isToolAllowedInPhase(definition.name, phase));
}

export type ToolDispatchBudgetDecision =
  | { action: 'allow' }
  | {
      action: 'reject';
      code: string;
      detail: string;
      enterFinalAnswer: boolean;
    };

export function evaluateToolDispatchBudget(input: {
  toolName: string;
  phase: ToolPhase;
  deliveryToolTurns: number;
  maxDeliveryToolTurns?: number;
}): ToolDispatchBudgetDecision {
  const maxDeliveryToolTurns =
    input.maxDeliveryToolTurns ?? AGENT_PROTOCOL_LIMITS.agentDeliveryToolTurnMax;

  if (!countsTowardToolTurn(input.toolName)) {
    return { action: 'allow' };
  }

  if (input.phase === 'final_only') {
    return {
      action: 'reject',
      code: AGENT_ERROR_CODES.toolPhaseRestricted,
      detail: '当前处于最终回答阶段，不能再调用工具。',
      enterFinalAnswer: true,
    };
  }

  if (input.phase === 'delivery') {
    if (!isToolAllowedInPhase(input.toolName, input.phase)) {
      return {
        action: 'reject',
        code: AGENT_ERROR_CODES.toolPhaseRestricted,
        detail:
          '交付阶段仅允许 create_file 与 create_report；请改用交付工具或直接进入最终回答。',
        enterFinalAnswer: false,
      };
    }
    if (input.deliveryToolTurns >= maxDeliveryToolTurns) {
      return {
        action: 'reject',
        code: AGENT_ERROR_CODES.toolCallLimitExceeded,
        detail: '交付阶段 Tool Turn 已用尽，请直接输出最终回答。',
        enterFinalAnswer: true,
      };
    }
  }

  return { action: 'allow' };
}

export function applyToolBatchTurnCount(input: {
  phase: ToolPhase;
  declaredCalls: ReadonlyArray<{ name: string }>;
  investigationToolTurns: number;
  deliveryToolTurns: number;
  maxInvestigationToolTurns?: number;
  maxDeliveryToolTurns?: number;
}): {
  investigationToolTurns: number;
  deliveryToolTurns: number;
  phase: ToolPhase;
  enterDelivery: boolean;
  enterFinalAnswer: boolean;
} {
  const maxInvestigationToolTurns =
    input.maxInvestigationToolTurns ?? AGENT_PROTOCOL_LIMITS.agentInvestigationToolTurnMax;
  const maxDeliveryToolTurns =
    input.maxDeliveryToolTurns ?? AGENT_PROTOCOL_LIMITS.agentDeliveryToolTurnMax;

  const hasBusinessTool = input.declaredCalls.some((call) => countsTowardToolTurn(call.name));
  if (!hasBusinessTool) {
    return {
      investigationToolTurns: input.investigationToolTurns,
      deliveryToolTurns: input.deliveryToolTurns,
      phase: input.phase,
      enterDelivery: false,
      enterFinalAnswer: false,
    };
  }

  let phase = input.phase;
  let investigationToolTurns = input.investigationToolTurns;
  let deliveryToolTurns = input.deliveryToolTurns;
  let enterDelivery = false;
  let enterFinalAnswer = false;

  if (phase === 'investigation') {
    investigationToolTurns += 1;
    if (investigationToolTurns >= maxInvestigationToolTurns) {
      phase = 'delivery';
      enterDelivery = true;
    }
  } else if (phase === 'delivery') {
    if (deliveryToolTurns < maxDeliveryToolTurns) {
      deliveryToolTurns += 1;
      if (deliveryToolTurns >= maxDeliveryToolTurns) {
        enterFinalAnswer = true;
      }
    }
  }

  return {
    investigationToolTurns,
    deliveryToolTurns,
    phase,
    enterDelivery,
    enterFinalAnswer,
  };
}
