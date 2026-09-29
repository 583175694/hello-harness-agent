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

  useLayoutEffect(() => {
    if (useLegacySplitLayout || !workbenchPresent || !workbenchOpen) return;
    groupRef.current?.setLayout(openLayout);
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

  if (!workbenchOpen) {
    return (
      <div className="agent-split-layout agent-split-layout--solo flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <div className="workbench-grid without-workbench min-h-0 min-w-0 flex-1 overflow-hidden">
          {conversation}
        </div>
        <div className="agent-split-workbench-host" aria-hidden="true" inert>
          {workbench}
        </div>
      </div>
    );
  }

  return (
    <ResizablePanelGroup
      className="agent-split-layout min-h-0 min-w-0 flex-1"
      id="pipishrimp-agent-split"
      groupRef={groupRef}
      orientation="horizontal"
      defaultLayout={openLayout}
      onLayoutChanged={handleLayoutChanged}
    >
      <ResizablePanel
        id="conversation"
        className="agent-split-panel agent-split-panel--conversation"
        minSize="28%"
        maxSize="55%"
      >
        {conversation}
      </ResizablePanel>
      <ResizableHandle withHandle />
      <ResizablePanel
        id="workbench"
        className="agent-split-panel agent-split-panel--workbench"
        minSize="45%"
      >
        {workbench}
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}
