import { useCallback, useEffect, type ReactNode } from 'react';

import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
  usePanelRef,
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
  const { defaultLayout, onLayoutChanged } = useAgentSplitLayout();
  const workbenchPanelRef = usePanelRef();

  const handleLayoutChanged = useCallback(
    (layout: { conversation?: number; workbench?: number }) => {
      if (!workbenchOpen) return;
      onLayoutChanged(layout);
    },
    [workbenchOpen, onLayoutChanged],
  );

  useEffect(() => {
    if (useLegacySplitLayout) return;
    const panel = workbenchPanelRef.current;
    if (!panel || !workbenchPresent) return;
    if (workbenchOpen) panel.expand();
    else panel.collapse();
  }, [workbenchOpen, workbenchPresent, workbenchPanelRef]);

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
        {workbench}
      </div>
    );
  }

  return (
    <ResizablePanelGroup
      className={`agent-split-layout${workbenchOpen ? '' : ' agent-split-layout--solo'}`}
      id="pipishrimp-agent-split"
      orientation="horizontal"
      defaultLayout={defaultLayout}
      onLayoutChanged={handleLayoutChanged}
    >
      <ResizablePanel
        id="conversation"
        className="agent-split-panel agent-split-panel--conversation"
        minSize={workbenchOpen ? '32%' : undefined}
        maxSize={workbenchOpen ? '55%' : '100%'}
      >
        {conversation}
      </ResizablePanel>
      {workbenchOpen ? <ResizableHandle withHandle /> : null}
      <ResizablePanel
        id="workbench"
        className="agent-split-panel agent-split-panel--workbench"
        panelRef={workbenchPanelRef}
        collapsible
        collapsedSize="0%"
        minSize={workbenchOpen ? '45%' : '0%'}
        defaultSize={`${workbenchOpen ? defaultLayout.workbench : 0}%`}
      >
        {workbench}
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}
