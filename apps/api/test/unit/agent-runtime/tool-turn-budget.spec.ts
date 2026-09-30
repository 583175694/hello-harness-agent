import { describe, expect, it } from 'vitest';

import { AGENT_ERROR_CODES, AGENT_TOOL_NAMES } from '@harness/agent-protocol';
import {
  applyToolBatchTurnCount,
  countsTowardToolTurn,
  evaluateToolDispatchBudget,
  filterToolDefinitionsForPhase,
  isToolAllowedInPhase,
} from '../../../src/agent-runtime/tool-turn-budget';

describe('tool-turn-budget', () => {
  it('treats update_plan as not counting toward tool turns', () => {
    expect(countsTowardToolTurn(AGENT_TOOL_NAMES.updatePlan)).toBe(false);
    expect(countsTowardToolTurn(AGENT_TOOL_NAMES.readFile)).toBe(true);
  });

  it('allows delivery whitelist only in delivery phase', () => {
    expect(isToolAllowedInPhase(AGENT_TOOL_NAMES.createReport, 'delivery')).toBe(true);
    expect(isToolAllowedInPhase(AGENT_TOOL_NAMES.webSearch, 'delivery')).toBe(false);
    expect(isToolAllowedInPhase(AGENT_TOOL_NAMES.webSearch, 'investigation')).toBe(true);
  });

  it('filters tool definitions for delivery phase', () => {
    const definitions = [
      { name: AGENT_TOOL_NAMES.webSearch, description: '', parameters: {} },
      { name: AGENT_TOOL_NAMES.createFile, description: '', parameters: {} },
      { name: AGENT_TOOL_NAMES.updatePlan, description: '', parameters: {} },
    ];
    const filtered = filterToolDefinitionsForPhase(definitions, 'delivery');
    expect(filtered?.map((item) => item.name).sort()).toEqual(
      [AGENT_TOOL_NAMES.createFile, AGENT_TOOL_NAMES.updatePlan].sort(),
    );
  });

  it('increments one investigation turn per batch with business tools', () => {
    const first = applyToolBatchTurnCount({
      phase: 'investigation',
      declaredCalls: Array.from({ length: 6 }, () => ({ name: AGENT_TOOL_NAMES.readFile })),
      investigationToolTurns: 0,
      deliveryToolTurns: 0,
      maxInvestigationToolTurns: 40,
      maxDeliveryToolTurns: 3,
    });
    expect(first.investigationToolTurns).toBe(1);
    expect(first.phase).toBe('investigation');
  });

  it('enters delivery after max investigation turns', () => {
    const result = applyToolBatchTurnCount({
      phase: 'investigation',
      declaredCalls: [{ name: AGENT_TOOL_NAMES.webSearch }],
      investigationToolTurns: 39,
      deliveryToolTurns: 0,
      maxInvestigationToolTurns: 40,
      maxDeliveryToolTurns: 3,
    });
    expect(result.investigationToolTurns).toBe(40);
    expect(result.phase).toBe('delivery');
    expect(result.enterDelivery).toBe(true);
  });

  it('rejects investigation tools in delivery phase', () => {
    const decision = evaluateToolDispatchBudget({
      toolName: AGENT_TOOL_NAMES.readFile,
      phase: 'delivery',
      deliveryToolTurns: 0,
    });
    expect(decision).toMatchObject({
      action: 'reject',
      code: AGENT_ERROR_CODES.toolPhaseRestricted,
    });
  });

  it('enters final answer when delivery turns are exhausted', () => {
    const batch = applyToolBatchTurnCount({
      phase: 'delivery',
      declaredCalls: [{ name: AGENT_TOOL_NAMES.createReport }],
      investigationToolTurns: 40,
      deliveryToolTurns: 2,
      maxInvestigationToolTurns: 40,
      maxDeliveryToolTurns: 3,
    });
    expect(batch.deliveryToolTurns).toBe(3);
    expect(batch.enterFinalAnswer).toBe(true);
  });
});
