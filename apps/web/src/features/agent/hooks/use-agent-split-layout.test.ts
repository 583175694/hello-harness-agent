import { afterEach, describe, expect, it } from 'vitest';

import {
  agentSplitLayoutStorage,
  clampConversationPercent,
  DEFAULT_AGENT_SPLIT,
} from './use-agent-split-layout';

describe('clampConversationPercent', () => {
  it('clamps to workbench min/max envelope', () => {
    expect(clampConversationPercent(20)).toBe(32);
    expect(clampConversationPercent(80)).toBe(55);
    expect(clampConversationPercent(40)).toBe(40);
  });
});

describe('agentSplitLayoutStorage', () => {
  afterEach(() => {
    window.localStorage.removeItem('pipishrimp.agent.split');
  });

  it('round-trips conversation percent through layout JSON', () => {
    window.localStorage.setItem('pipishrimp.agent.split', '48');
    const raw = agentSplitLayoutStorage.getItem('ignored');
    expect(raw).toBe(JSON.stringify({ conversation: 48, workbench: 52 }));

    agentSplitLayoutStorage.setItem('ignored', JSON.stringify({ conversation: 40, workbench: 60 }));
    expect(window.localStorage.getItem('pipishrimp.agent.split')).toBe('40');
  });

  it('returns null when nothing stored', () => {
    expect(agentSplitLayoutStorage.getItem('ignored')).toBeNull();
    expect(DEFAULT_AGENT_SPLIT.conversation).toBe(40);
    expect(DEFAULT_AGENT_SPLIT.workbench).toBe(60);
  });
});
