import { useEffect, useState } from 'react';
import {
  CircleAlert,
  Clock3,
  FileSearch,
  FileText,
  Plug,
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
import {
  mcpServerIconFallbackSrc,
  parseMcpPublicToolName,
  type AssistantToolActivityBlock,
} from '@harness/agent-protocol';

import { mcpIconDisplayUrl } from '../model/mcp-icon-display';
import { processTimelineToolIconKind } from '@harness/agent-conversation';
import { isMcpPublicToolName, mcpInlineActivityLabel } from '../model/tool-copy';
import type { AssistantProcessItem } from './assistant-message-adapter';
import {
  Reasoning,
  ReasoningContent,
  ReasoningTrigger,
} from '../../../components/ai-elements/reasoning';
import { Shimmer } from '../../../components/ai-elements/shimmer';
import { MarkdownContent } from '../../../components/markdown-content';

function mcpToolIconImageSrc(block: AssistantToolActivityBlock): string | undefined {
  const fromBlock = mcpIconDisplayUrl(block.iconSrc);
  if (fromBlock) return fromBlock;
  const parsed = parseMcpPublicToolName(block.toolName);
  if (!parsed) return undefined;
  return mcpIconDisplayUrl(mcpServerIconFallbackSrc(parsed.serverName));
}

const PROCESS_TIMELINE_TOOL_ICONS = {
  search: Search,
  fileSearch: FileSearch,
  fileText: FileText,
  terminal: Terminal,
  clock: Clock3,
  plug: Plug,
} as const satisfies Record<ReturnType<typeof processTimelineToolIconKind>, LucideIcon>;

function toolIcon(toolName: string): LucideIcon {
  return PROCESS_TIMELINE_TOOL_ICONS[processTimelineToolIconKind(toolName)];
}

function formatElapsed(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  if (totalSeconds < 60) return `已用时 ${totalSeconds} 秒`;
  return `已用时 ${Math.floor(totalSeconds / 60)} 分 ${totalSeconds % 60}秒`;
}

function parseTime(iso?: string): number | undefined {
  if (!iso) return undefined;
  const value = Date.parse(iso);
  return Number.isFinite(value) ? value : undefined;
}

function processTimeRange(process: AssistantProcessItem[]) {
  const starts: number[] = [];
  const ends: number[] = [];
  for (const item of process) {
    if (item.kind === 'tool') {
      const started = parseTime(item.block.startedAt);
      if (started !== undefined) starts.push(started);
      const completed = parseTime(item.block.completedAt);
      if (completed !== undefined) ends.push(completed);
      continue;
    }
    if (item.kind === 'reasoning') {
      const started = parseTime(item.block.startedAt);
      if (started !== undefined) starts.push(started);
      const completed = parseTime(item.block.completedAt);
      if (completed !== undefined) ends.push(completed);
    }
  }
  return {
    start: starts.length ? Math.min(...starts) : undefined,
    end: ends.length ? Math.max(...ends) : undefined,
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
  finalOutputVisible = false,
  onFocusWorkbench,
}: {
  process: AssistantProcessItem[];
  workbench?: WorkbenchState;
  running: boolean;
  finalOutputVisible?: boolean;
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
    <ChainOfThought autoCollapse finalOutputVisible={finalOutputVisible} running={running}>
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
          const mcpStep = isMcpPublicToolName(item.block.toolName);
          const toolTitle = bashStep
            ? bashCoTLabel(item.block)
            : mcpStep
              ? mcpInlineActivityLabel(item.block)
              : item.block.toolName === 'web_search'
                ? (workbenchTitle ??
                  (item.block.summary ? `搜索：${item.block.summary}` : item.block.title))
                : item.block.title;
          return (
            <button
              className={`agent-chain-tool${mcpStep ? ' agent-chain-tool--mcp' : ''}`}
              type="button"
              key={item.block.id}
              disabled={!workbench}
              aria-label={`${toolTitle}，${toolStatusLabel(item.block.status)}`}
              title={mcpStep ? toolTitle : undefined}
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
                iconImageSrc={
                  mcpStep ? mcpToolIconImageSrc(item.block) : mcpIconDisplayUrl(item.block.iconSrc)
                }
                label={
                  <span className="agent-chain-tool__label">
                    <span className="agent-chain-tool__title">
                      {item.block.status === 'running' ? <Shimmer>{toolTitle}</Shimmer> : toolTitle}
                    </span>
                    {item.block.summary &&
                    item.block.toolName !== 'web_search' &&
                    !bashStep &&
                    !mcpStep ? (
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
