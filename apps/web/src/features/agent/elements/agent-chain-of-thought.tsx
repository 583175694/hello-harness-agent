import {
  Check,
  CircleAlert,
  Clock3,
  FileSearch,
  FileText,
  LoaderCircle,
  MessageSquareText,
  Search,
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
import type { AssistantProcessItem } from './assistant-message-adapter';

function toolIcon(toolName: string): LucideIcon {
  if (toolName === 'web_search' || toolName === 'web_fetch') return Search;
  if (toolName === 'search_file' || toolName === 'read_file_lines') return FileSearch;
  if (toolName === 'create_file') return FileText;
  return Clock3;
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
  if (status === 'running') return LoaderCircle;
  if (status === 'failed') return CircleAlert;
  if (status === 'cancelled') return X;
  return Check;
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
  if (!process.length) return null;
  return (
    <ChainOfThought running={running}>
      <ChainOfThoughtHeader>{running ? '正在处理' : '处理过程'}</ChainOfThoughtHeader>
      <ChainOfThoughtContent>
        {process.map((item) => {
          if (item.kind === 'text') {
            return (
              <ChainOfThoughtStep
                key={item.block.id}
                icon={MessageSquareText}
                label={item.block.content}
                status="complete"
              />
            );
          }
          const domains =
            item.block.toolName === 'web_search' || item.block.toolName === 'web_fetch'
              ? sourceDomains(workbench?.sources ?? [], item.block.toolCallId)
              : [];
          const StateIcon = statusIcon(item.block.status);
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
                icon={toolIcon(item.block.toolName)}
                label={
                  <span className="agent-chain-tool__label">
                    {item.block.title}
                    <StateIcon
                      className={
                        item.block.status === undefined || item.block.status !== 'running'
                          ? ''
                          : 'spin'
                      }
                      size={13}
                      aria-hidden="true"
                    />
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
