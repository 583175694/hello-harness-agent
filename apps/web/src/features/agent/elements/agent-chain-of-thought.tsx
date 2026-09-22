import { useEffect, useState } from 'react';
import {
  Check,
  CircleAlert,
  Clock3,
  FileSearch,
  FileText,
  Search,
  Terminal,
  X,
  type LucideIcon,
} from 'lucide-react';

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
import { bashCoTLabel, isBashTransparentTool } from '../model/bash-transparent';
import type { AssistantProcessItem } from './assistant-message-adapter';
import {
  Reasoning,
  ReasoningContent,
  ReasoningTrigger,
} from '../../../components/ai-elements/reasoning';
import { Shimmer } from '../../../components/ai-elements/shimmer';
import { MarkdownContent } from '../../../components/markdown-content';

function toolIcon(toolName: string): LucideIcon {
  if (toolName === 'web_search' || toolName === 'web_fetch') return Search;
  if (toolName === 'search_file' || toolName === 'read_file_lines') return FileSearch;
  if (toolName === 'create_file' || toolName === 'create_report') return FileText;
  if (toolName === 'bash') return Terminal;
  if (toolName === 'execute_command') return Clock3;
  return Clock3;
}

function formatElapsed(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  if (totalSeconds < 60) return `已用时 ${totalSeconds} 秒`;
  return `已用时 ${Math.floor(totalSeconds / 60)} 分 ${totalSeconds % 60}秒`;
}

function processTimeRange(process: AssistantProcessItem[]) {
  const tools = process.filter(
    (item): item is Extract<AssistantProcessItem, { kind: 'tool' }> => item.kind === 'tool',
  );
  const start = Math.min(
    ...tools.map((item) => Date.parse(item.block.startedAt)).filter(Number.isFinite),
  );
  const completed = tools
    .map((item) => (item.block.completedAt ? Date.parse(item.block.completedAt) : NaN))
    .filter(Number.isFinite);
  return {
    start: Number.isFinite(start) ? start : undefined,
    end: completed.length ? Math.max(...completed) : undefined,
  };
}

function stepStatus(
  status: Extract<AssistantProcessItem, { kind: 'tool' }>['block']['status'],
): ChainStepStatus {
  if (status === 'running') return 'active';
  if (status === 'failed') return 'failed';
  if (status === 'cancelled') return 'cancelled';
  return 'complete';
}

function statusIcon(status: Extract<AssistantProcessItem, { kind: 'tool' }>['block']['status']) {
  if (status === 'failed') return CircleAlert;
  if (status === 'cancelled') return X;
  return undefined;
}

function processElapsed(
  start: number | undefined,
  end: number | undefined,
  running: boolean,
  now: number,
): number {
  if (start === undefined) return 0;
  const finish = running ? now : (end ?? start);
  return finish - start;
}

function reasoningLabel(streaming: boolean, durationMs?: number): string {
  if (streaming) return 'Thinking...';
  if (durationMs !== undefined) {
    return `Thought for ${Math.max(0, Math.round(durationMs / 1000))} seconds`;
  }
  return 'Thought';
}

function toolStatusLabel(status: Extract<AssistantProcessItem, { kind: 'tool' }>['block']['status']) {
  if (status === 'running') return '执行中';
  if (status === 'completed') return '已完成';
  if (status === 'failed') return '失败';
  return '已取消';
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
  // 整个 assistant 仍在运行时，历史工具的 completedAt 不能冻结总用时；
  // 只有进入终态后，才以最后一个已完成工具的时间作为结束点。
  const elapsed = processElapsed(start, end, running, now);
  return (
    <ChainOfThought running={running}>
      <ChainOfThoughtHeader>{formatElapsed(elapsed)}</ChainOfThoughtHeader>
      <ChainOfThoughtContent>
        {process.map((item) => {
          if (item.kind === 'reasoning') {
            const streaming = !item.block.completedAt;
            const label = reasoningLabel(streaming, item.block.durationMs);
            return (
              <Reasoning className='ai-reasoning' key={item.block.id} isStreaming={streaming}>
                <ReasoningTrigger>{label}</ReasoningTrigger>
                <ReasoningContent>{item.block.content}</ReasoningContent>
              </Reasoning>
            );
          }
          if (item.kind === 'text') {
            return (
              <ChainOfThoughtStep icon={undefined} key={item.block.id} status="complete">
                <div className="ai-chain-step__markdown">
                  <MarkdownContent variant="chat">{item.block.content}</MarkdownContent>
                </div>
              </ChainOfThoughtStep>
            );
          }
          const domains =
            item.block.toolName === 'web_search' || item.block.toolName === 'web_fetch'
              ? sourceDomains(workbench?.sources ?? [], item.block.toolCallId)
              : [];
          const StateIcon = statusIcon(item.block.status);
          const workbenchTitle = workbench?.executions.find(
            (execution) => execution.toolCallId === item.block.toolCallId,
          )?.title;
          const bashStep = isBashTransparentTool(item.block);
          const toolTitle = bashStep
            ? bashCoTLabel(item.block)
            : item.block.toolName === 'web_search'
              ? (workbenchTitle ??
                (item.block.summary ? `搜索：${item.block.summary}` : item.block.title))
              : item.block.title;
          return (
            <button
              className="agent-chain-tool"
              type="button"
              key={item.block.id}
              disabled={!workbench}
              aria-label={`${toolTitle}，${toolStatusLabel(item.block.status)}`}
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
                icon={toolIcon(item.block.toolName)}
                label={
                  <span className="agent-chain-tool__label">
                    <span className="agent-chain-tool__title">
                      {item.block.status === 'running' ? <Shimmer>{toolTitle}</Shimmer> : toolTitle}
                    </span>
                    {item.block.summary &&
                    item.block.toolName !== 'web_search' &&
                    !bashStep ? (
                      <span className="agent-chain-tool__summary">{item.block.summary}</span>
                    ) : null}
                    {StateIcon ? <StateIcon size={13} aria-hidden="true" /> : null}
                  </span>
                }
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
