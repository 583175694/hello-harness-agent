import { View } from 'react-native';
import { Text } from '@/components/ui/text';
import {
  normalizeWorkbenchView,
  resolveMobileWorkbenchVisibleTabs,
} from '../config/workbench-tabs';
import type { WorkspaceView } from '../fixtures/ui-fixtures';
import { WorkbenchActivityContent, type WorkbenchActivityEmphasis } from './workbench-activity-view';
import { WorkbenchArtifactBody } from './workbench-artifact-view';
import { WorkbenchSegmentedTabs } from './workbench-segmented-tabs';

type WorkbenchPanelProps = {
  activeView: WorkspaceView;
  workbenchCount?: number;
  hasDeliverables?: boolean;
  activityEmphasis?: WorkbenchActivityEmphasis;
  onViewChange?: (view: WorkspaceView) => void;
};

export function WorkbenchPanel({
  activeView,
  workbenchCount = 0,
  hasDeliverables,
  activityEmphasis = 'default',
  onViewChange,
}: WorkbenchPanelProps) {
  const visibleTabs = resolveMobileWorkbenchVisibleTabs({ workbenchCount, hasDeliverables });
  const view = normalizeWorkbenchView(activeView, visibleTabs);
  const showTabBar = visibleTabs.length > 1;

  return (
    <View className="flex-1 border-l border-composer-border bg-surface">
      <View className="border-b border-composer-border px-3 py-2">
        <Text variant="body-sm" className="font-semibold">
          工作台
        </Text>
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
          <WorkbenchArtifactBody bottomInset={0} />
        ) : (
          <WorkbenchActivityContent emphasis={activityEmphasis} />
        )}
      </View>
    </View>
  );
}
