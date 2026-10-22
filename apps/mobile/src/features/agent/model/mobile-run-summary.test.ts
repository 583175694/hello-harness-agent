import { describe, expect, it } from 'vitest';

import {
  mobileRunPeekVisible,
  mobileRunSummaryLine,
} from './mobile-run-summary';

describe('mobileRunSummaryLine', () => {
  it('uses plan step when running with plan', () => {
    const line = mobileRunSummaryLine({
      runId: 'run-1',
      title: 't',
      subtitle: 's',
      activeView: 'tool_results',
      executions: [],
      followMode: 'auto',
      sources: [],
      open: true,
      activityStatus: 'running',
      plan: {
        plan: [
          { step: '检索来源', status: 'completed' },
          { step: '撰写报告', status: 'in_progress' },
        ],
      },
    });
    expect(line).toContain('2/2');
    expect(line).toContain('撰写报告');
  });

  it('hides peek for terminal runs', () => {
    expect(
      mobileRunPeekVisible(
        {
          runId: 'run-1',
          title: 't',
          subtitle: 's',
          activeView: 'tool_results',
          executions: [],
          followMode: 'auto',
          sources: [],
          open: true,
          activityStatus: 'completed',
        },
        'run-1',
      ),
    ).toBe(false);
  });
});
