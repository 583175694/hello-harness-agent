import { act, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AgentChainOfThought } from './agent-chain-of-thought';
import type { AssistantProcessItem } from './assistant-message-adapter';

const process: AssistantProcessItem[] = [
  {
    kind: 'tool',
    block: {
      id: 'tool-1',
      type: 'tool_activity',
      toolCallId: 'call-1',
      toolName: 'web_search',
      title: '搜索网页',
      status: 'completed',
      startedAt: '2026-09-21T00:00:00.000Z',
      completedAt: '2026-09-21T00:00:02.000Z',
      durationMs: 2_000,
      roundId: 'round-1',
      roundSequence: 1,
      blockSequence: 0,
    },
  },
];

afterEach(() => {
  vi.useRealTimers();
});

describe('AgentChainOfThought bash transparent events', () => {
  it('renders a single Bash · description line', () => {
    render(
      <AgentChainOfThought
        process={[
          {
            kind: 'tool',
            block: {
              id: 'tool-bash',
              type: 'tool_activity',
              toolCallId: 'call-bash',
              toolName: 'bash',
              title: 'Bash',
              status: 'running',
              presentation: 'terminal',
              description: 'Check current system date',
              startedAt: '2026-09-21T00:00:00.000Z',
            },
          },
        ]}
        running
        onFocusWorkbench={() => undefined}
      />,
    );

    expect(
      screen.getByRole('button', { name: 'Bash · Check current system date，执行中' }),
    ).toBeInTheDocument();
  });
});

describe('AgentChainOfThought elapsed time', () => {
  it('keeps ticking every second while the assistant is running after a tool completes', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-21T00:00:40.000Z'));
    render(
      <AgentChainOfThought
        process={process}
        running
        onFocusWorkbench={() => undefined}
      />,
    );

    expect(screen.getByRole('button', { name: '已用时 40 秒' })).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(1_000);
    });
    expect(screen.getByRole('button', { name: '已用时 41 秒' })).toBeInTheDocument();
  });

  it('uses the last completed tool time after the assistant reaches a terminal state', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-21T00:00:40.000Z'));
    render(
      <AgentChainOfThought
        process={process}
        running={false}
        onFocusWorkbench={() => undefined}
      />,
    );

    expect(screen.getByRole('button', { name: '已用时 2 秒' })).toBeInTheDocument();
  });
});
