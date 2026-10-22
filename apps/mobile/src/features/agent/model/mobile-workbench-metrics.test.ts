import { describe, expect, it } from 'vitest';

import { mobileWorkbenchBadgeCount } from './mobile-workbench-metrics';

describe('mobileWorkbenchBadgeCount', () => {
  it('sums active tool_activity blocks and artifacts for active run', () => {
    const count = mobileWorkbenchBadgeCount({
      activeRunId: 'run-1',
      workbench: {
        runId: 'run-1',
        title: '工具执行',
        subtitle: '',
        activeView: 'tool_results',
        followMode: 'auto',
        open: false,
        executions: [],
        sources: [],
        artifacts: [{ artifactId: 'a1' } as never, { artifactId: 'a2' } as never],
      },
      conversation: [
        {
          id: 'm1',
          kind: 'assistant',
          runId: 'run-1',
          blocks: [
            { type: 'tool_activity', toolCallId: 't1', toolName: 'bash', status: 'running' } as never,
            { type: 'tool_activity', toolCallId: 't2', toolName: 'bash', status: 'completed' } as never,
          ],
        },
      ],
    });

    expect(count).toBe(3);
  });

  it('uses artifact count only when no active run', () => {
    const count = mobileWorkbenchBadgeCount({
      workbench: {
        runId: 'run-1',
        title: '工具执行',
        subtitle: '',
        activeView: 'tool_results',
        followMode: 'auto',
        open: false,
        executions: [],
        sources: [],
        artifacts: [{ artifactId: 'a1' } as never],
      },
      conversation: [],
    });

    expect(count).toBe(1);
  });
});
