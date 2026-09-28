import { type CSSProperties, type ReactNode } from 'react';

import { useAgentSplitLayout } from '../hooks/use-agent-split-layout';

function WorkbenchGrid({
  workbenchOpen,
  conversation,
  workbench,
  conversationSplit,
}: {
  workbenchOpen: boolean;
  conversation: ReactNode;
  workbench?: ReactNode;
  conversationSplit: number;
}) {
  return (
    <div
      className={`workbench-grid min-h-0 min-w-0 flex-1 overflow-hidden ${workbenchOpen ? 'has-workbench' : 'without-workbench'}`}
      style={{ '--conversation-split': `${conversationSplit}%` } as CSSProperties}
    >
      {conversation}
      {workbench}
    </div>
  );
}

export function AgentSplitLayout({
  workbenchPresent,
  workbenchOpen,
  conversation,
  workbench,
}: {
  /** 当前 Run 是否已有 workbench 投影（含收起态） */
  workbenchPresent: boolean;
  /** 用户是否展开工作台 */
  workbenchOpen: boolean;
  conversation: ReactNode;
  workbench: ReactNode;
}) {
  const { defaultLayout } = useAgentSplitLayout();

  if (!workbenchPresent) {
    return (
      <div className="workbench-grid without-workbench min-h-0 min-w-0 flex-1 overflow-hidden">
        {conversation}
      </div>
    );
  }

  return (
    <WorkbenchGrid
      workbenchOpen={workbenchOpen}
      conversation={conversation}
      workbench={workbench}
      conversationSplit={defaultLayout.conversation}
    />
  );
}
