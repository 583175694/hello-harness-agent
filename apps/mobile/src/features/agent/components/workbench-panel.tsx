import { View } from 'react-native';
import { Text } from '@/components/ui/text';
import {
  normalizeWorkbenchView,
  resolveMobileWorkbenchVisibleTabs,
} from '../config/workbench-tabs';
import type { WorkbenchState } from '@harness/agent-ui-types';
import type { WorkspaceView } from '../fixtures/ui-fixtures';
import { WorkbenchActivityContent, type WorkbenchActivityEmphasis } from './workbench-activity-view';
import { WorkbenchArtifactBody } from './workbench-artifact-view';
import { WorkbenchRunControls } from './workbench-run-controls';
import { WorkbenchSegmentedTabs } from './workbench-segmented-tabs';

type WorkbenchPanelProps = {
  activeView: WorkspaceView;
  workbenchCount?: number;
  hasDeliverables?: boolean;
  activityEmphasis?: WorkbenchActivityEmphasis;
  workbench?: WorkbenchState;
  selectedToolCallId?: string | null;
  focusArtifactId?: string | null;
  onSelectToolCall?: (toolCallId: string) => void;
  onViewChange?: (view: WorkspaceView) => void;
  activeRunId?: string | null;
  onPauseRun?: () => void;
  onResumeRun?: () => void;
  workbenchReportId?: string;
  usePreviewFixtures?: boolean;
};

export function WorkbenchPanel({
  activeView,
  workbenchCount = 0,
  hasDeliverables,
  activityEmphasis = 'default',
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
}: WorkbenchPanelProps) {
  const visibleTabs = resolveMobileWorkbenchVisibleTabs({ workbenchCount, hasDeliverables });
  const view = normalizeWorkbenchView(activeView, visibleTabs);
  const showTabBar = visibleTabs.length > 1;

  return (
    <View className="flex-1 border-l border-composer-border bg-surface">
      <View className="gap-2 border-b border-composer-border px-3 py-2">
        <View className="flex-row items-center justify-between gap-2">
          <Text variant="body-sm" className="font-semibold">
            工作台
          </Text>
          <WorkbenchRunControls
            activityStatus={workbench?.activityStatus}
            activeRunId={activeRunId}
            onPause={onPauseRun}
            onResume={onResumeRun}
          />
        </View>
      </View>
      {showTabBar ? (
        <WorkbenchSegmentedTabs
          tabs={visibleTabs}
          active={view}
          onTabPress={(v) => onViewChange?.(v)}
        />
      ) : null}
      <View className="flex-1">
        {view === 'artifact' ? (
          <WorkbenchArtifactBody
            bottomInset={0}
            workbench={workbench}
            focusArtifactId={focusArtifactId}
            reportId={workbenchReportId}
          />
        ) : (
          <WorkbenchActivityContent
            emphasis={activityEmphasis}
            workbench={workbench}
            selectedToolCallId={selectedToolCallId}
            onSelectToolCall={onSelectToolCall}
            usePreviewFixtures={usePreviewFixtures}
          />
        )}
      </View>
    </View>
  );
}
