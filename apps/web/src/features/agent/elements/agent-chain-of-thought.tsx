import { useEffect, useState } from 'react';

import {
  ChainOfThought,
  ChainOfThoughtContent,
  ChainOfThoughtHeader,
  ChainOfThoughtSearchResult,
  ChainOfThoughtSearchResults,
  ChainOfThoughtStep,
  type ChainStepStatus,
} from '../../../components/ai-elements/chain-of-thought';
import type { SourceView, WorkbenchFocusTarget, WorkbenchState } from '../model/types';
import type { AssistantProcessItem } from './assistant-message-adapter';

function formatElapsed(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  if (totalSeconds < 60) return `已用时 ${totalSeconds} 秒`;
  return `已用时 ${Math.floor(totalSeconds / 60)} 分 ${totalSeconds % 60}秒`;
}

function processTimeRange(process: AssistantProcessItem[]) {
  const tools = process.filter((item): item is Extract<AssistantProcessItem, { kind: 'tool' }> => item.kind === 'tool');
  const start = Math.min(...tools.map((item) => Date.parse(item.block.startedAt)).filter(Number.isFinite));
  const completed = tools
    .map((item) => (item.block.completedAt ? Date.parse(item.block.completedAt) : NaN))
    .filter(Number.isFinite);
  return { start: Number.isFinite(start) ? start : undefined, end: completed.length ? Math.max(...completed) : undefined };
}

function stepStatus(
  status: Extract<AssistantProcessItem, { kind: 'tool' }>['block']['status'],
): ChainStepStatus {
  if (status === 'running') return 'active';
  if (status === 'failed') return 'failed';
  if (status === 'cancelled') return 'cancelled';
  return 'complete';
}

function sourceDomains(sources: SourceView[], toolCallId: string): string[] {
  const matched = sources.filter((source) => source.toolCallIds?.includes(toolCallId));
  const candidates = matched.length ? matched : sources;
  return [...new Set(candidates.map((source) => source.domain).filter(Boolean))].slice(0, 6);
}

export function AgentChainOfThought({
  process,
  workbench,
  running,
  onFocusWorkbench,
}: {
  process: AssistantProcessItem[];
  workbench?: WorkbenchState;
  running: boolean;
  onFocusWorkbench: (target: WorkbenchFocusTarget) => void;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!running) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [running]);
  if (!process.length) return null;
  const [{ start, end }] = [processTimeRange(process)];
  const elapsed = start === undefined ? 0 : (end ?? (running ? now : start)) - start;
  return (
    <ChainOfThought running={running}>
      <ChainOfThoughtHeader>{formatElapsed(elapsed)}</ChainOfThoughtHeader>
      <ChainOfThoughtContent>
        {process.map((item) => {
          if (item.kind === 'text') {
            return (
              <ChainOfThoughtStep
                key={item.block.id}
                label={item.block.content}
                status="complete"
              />
            );
          }
          const domains =
            item.block.toolName === 'web_search' || item.block.toolName === 'web_fetch'
              ? sourceDomains(workbench?.sources ?? [], item.block.toolCallId)
              : [];
          return (
            <button
              className="agent-chain-tool"
              type="button"
              key={item.block.id}
              disabled={!workbench}
              aria-label={`${item.block.title}，${item.block.status === 'running' ? '执行中' : item.block.status === 'completed' ? '已完成' : item.block.status === 'failed' ? '失败' : '已取消'}`}
              onClick={() =>
                workbench &&
                onFocusWorkbench({
                  kind: 'tool_call',
                  runId: workbench.runId,
                  stepId: item.block.toolCallId,
                  toolCallId: item.block.toolCallId,
                })
              }
            >
              <ChainOfThoughtStep
                label={
                  <span className="agent-chain-tool__label">
                    {item.block.title}
                  </span>
                }
                description={item.block.summary}
                status={stepStatus(item.block.status)}
              >
                {domains.length ? (
                  <ChainOfThoughtSearchResults>
                    {domains.map((domain) => (
                      <ChainOfThoughtSearchResult key={domain}>{domain}</ChainOfThoughtSearchResult>
                    ))}
                  </ChainOfThoughtSearchResults>
                ) : null}
              </ChainOfThoughtStep>
            </button>
          );
        })}
      </ChainOfThoughtContent>
    </ChainOfThought>
  );
}
