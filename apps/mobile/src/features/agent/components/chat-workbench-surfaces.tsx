import type { BottomSheetModal } from '@gorhom/bottom-sheet';
import type { RefObject } from 'react';
import type { WorkbenchState } from '@harness/agent-ui-types';

import type { WorkbenchActivityEmphasis } from './workbench-activity-view';
import type { WorkspaceView } from '../fixtures/ui-fixtures';
import { WorkbenchPanel } from './workbench-panel';
import { WorkbenchSheet } from './workbench-sheet';

type ChatWorkbenchSurfacesProps = {
  isSplitLayout: boolean;
  splitPaneOpen: boolean;
  sheetRef: RefObject<BottomSheetModal | null>;
  activeView: WorkspaceView;
  workbenchCount: number;
  hasDeliverables: boolean;
  activityEmphasis: WorkbenchActivityEmphasis;
  workbench?: WorkbenchState;
  selectedToolCallId?: string | null;
  focusArtifactId?: string | null;
  onSelectToolCall?: (toolCallId: string) => void;
  onViewChange: (view: WorkspaceView) => void;
  onRequestClose: () => void;
  activeRunId?: string | null;
  onPauseRun?: () => void;
  onResumeRun?: () => void;
  workbenchReportId?: string;
  usePreviewFixtures?: boolean;
};

export function ChatWorkbenchSurfaces({
  isSplitLayout,
  splitPaneOpen,
  sheetRef,
  activeView,
  workbenchCount,
  hasDeliverables,
  activityEmphasis,
  workbench,
  selectedToolCallId,
  focusArtifactId,
  onSelectToolCall,
  onViewChange,
  onRequestClose,
  activeRunId,
  onPauseRun,
  onResumeRun,
  workbenchReportId,
  usePreviewFixtures,
}: ChatWorkbenchSurfacesProps) {
  const shared = {
    activeView,
    workbenchCount,
    hasDeliverables,
    activityEmphasis,
    workbench,
    selectedToolCallId,
    focusArtifactId,
    onSelectToolCall,
    onViewChange,
    activeRunId,
    onPauseRun,
    onResumeRun,
    workbenchReportId,
    usePreviewFixtures,
  };

  return (
    <>
      {isSplitLayout && splitPaneOpen ? (
        <WorkbenchPanel {...shared} />
      ) : null}
      {!isSplitLayout ? (
        <WorkbenchSheet ref={sheetRef} {...shared} onRequestClose={onRequestClose} />
      ) : null}
    </>
  );
}
