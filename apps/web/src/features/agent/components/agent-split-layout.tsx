import { useCallback, useLayoutEffect, type ReactNode } from 'react';

import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
  useGroupRef,
} from '../../../components/ui/resizable';
import { useAgentSplitLayout } from '../hooks/use-agent-split-layout';

/** Vitest/jsdom 下 react-resizable-panels 无法稳定挂载，回退旧 grid 布局。 */
const useLegacySplitLayout = import.meta.env.MODE === 'test';

const SOLO_LAYOUT = { conversation: 100, workbench: 0 } as const;

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
  const { defaultLayout: openLayout, onLayoutChanged } = useAgentSplitLayout();
  const groupRef = useGroupRef();

  const handleLayoutChanged = useCallback(
    (layout: { conversation?: number; workbench?: number }, meta: { isUserInteraction: boolean }) => {
      if (!workbenchOpen) return;
      onLayoutChanged(layout, meta);
    },
    [workbenchOpen, onLayoutChanged],
  );

  // Workbench 展开/收起只改 Panel 比例，避免切换另一套 DOM 树导致 Conversation remount。
  useLayoutEffect(() => {
    if (useLegacySplitLayout || !workbenchPresent) return;
    groupRef.current?.setLayout(workbenchOpen ? openLayout : SOLO_LAYOUT);
  }, [workbenchOpen, workbenchPresent, openLayout, groupRef]);

  if (!workbenchPresent) {
    return (
      <div className="workbench-grid without-workbench min-h-0 min-w-0 flex-1 overflow-hidden">
        {conversation}
      </div>
    );
  }

  if (useLegacySplitLayout) {
    return (
      <div
        className={`workbench-grid min-h-0 min-w-0 flex-1 overflow-hidden ${workbenchOpen ? 'has-workbench' : 'without-workbench'}`}
      >
        {conversation}
        {workbenchOpen ? workbench : null}
      </div>
    );
  }

  return (
    <ResizablePanelGroup
      className={`agent-split-layout min-h-0 min-w-0 flex-1${workbenchOpen ? '' : ' agent-split-layout--workbench-collapsed'}`}
      id="pipishrimp-agent-split"
      groupRef={groupRef}
      orientation="horizontal"
      defaultLayout={workbenchOpen ? openLayout : SOLO_LAYOUT}
      onLayoutChanged={handleLayoutChanged}
    >
      <ResizablePanel
        id="conversation"
        className="agent-split-panel agent-split-panel--conversation"
        minSize={workbenchOpen ? '28%' : '100%'}
        maxSize={workbenchOpen ? '55%' : '100%'}
      >
        {conversation}
      </ResizablePanel>
      {workbenchOpen ? <ResizableHandle withHandle /> : null}
      <ResizablePanel
        id="workbench"
        className="agent-split-panel agent-split-panel--workbench"
        minSize={workbenchOpen ? '45%' : '0%'}
        maxSize={workbenchOpen ? undefined : '0%'}
        style={workbenchOpen ? undefined : { overflow: 'hidden', flexGrow: 0 }}
      >
        <div
          className="agent-split-workbench-host h-full min-h-0"
          aria-hidden={workbenchOpen ? undefined : true}
          {...(!workbenchOpen ? { inert: true as unknown as boolean } : {})}
        >
          {workbench}
        </div>
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}
