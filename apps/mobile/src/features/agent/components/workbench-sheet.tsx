import {
  BottomSheetBackdrop,
  BottomSheetModal,
  BottomSheetScrollView,
  type BottomSheetBackdropProps,
} from '@gorhom/bottom-sheet';
import { forwardRef, useCallback, useMemo } from 'react';
import { Pressable, View } from 'react-native';
import { X } from 'lucide-react-native';
import { Text } from '@/components/ui/text';
import type { WorkspaceView } from '../fixtures/ui-fixtures';
import { WorkbenchActivityView } from './workbench-activity-view';
import { WorkbenchArtifactView } from './workbench-artifact-view';
import { WorkbenchSegmentedTabs } from './workbench-segmented-tabs';
import { WorkbenchContextView } from './workbench-context-view';
import { WorkbenchReportView } from './workbench-report-view';
import { WorkbenchSourcesView } from './workbench-sources-view';

type WorkbenchSheetProps = {
  activeView: WorkspaceView;
  workbenchCount?: number;
  onDismiss?: () => void;
  onRequestClose?: () => void;
  onViewChange?: (view: WorkspaceView) => void;
};

export const WorkbenchSheet = forwardRef<BottomSheetModal, WorkbenchSheetProps>(function WorkbenchSheet(
  { activeView, workbenchCount = 3, onDismiss, onRequestClose, onViewChange },
  ref,
) {
  const snapPoints = useMemo(() => ['38%', '60%', '92%'], []);

  const tabs = useMemo(
    () => [
      { id: 'activity' as const, label: '活动' },
      { id: 'sources' as const, label: '来源', count: 5 },
      { id: 'artifact' as const, label: '产物', count: workbenchCount },
      { id: 'report' as const, label: 'Report' },
      { id: 'context' as const, label: 'Context' },
    ],
    [workbenchCount],
  );

  const renderBackdrop = useCallback(
    (props: BottomSheetBackdropProps) => (
      <BottomSheetBackdrop {...props} disappearsOnIndex={-1} appearsOnIndex={0} opacity={0.4} />
    ),
    [],
  );

  return (
    <BottomSheetModal
      ref={ref}
      snapPoints={snapPoints}
      enablePanDownToClose
      onDismiss={onDismiss}
      backdropComponent={renderBackdrop}
      handleIndicatorStyle={{ backgroundColor: '#dededb', width: 36 }}
      backgroundStyle={{
        backgroundColor: '#ffffff',
        borderTopLeftRadius: 20,
        borderTopRightRadius: 20,
        borderTopWidth: 1,
        borderColor: '#dededb',
      }}
    >
      <BottomSheetScrollView contentContainerStyle={{ paddingBottom: 24 }}>
        <View className="gap-3 border-b border-composer-border px-4 pb-2.5 pt-1">
          <View className="flex-row items-center justify-between">
            <Text variant="headline" className="text-[15px]">
              工作台 ({workbenchCount})
            </Text>
            <Pressable
              onPress={onRequestClose}
              className="h-7 w-7 items-center justify-center rounded-full active:bg-subtle"
              accessibilityLabel="关闭工作台"
            >
              <X size={20} color="#555551" />
            </Pressable>
          </View>
          <WorkbenchSegmentedTabs tabs={tabs} active={activeView} onTabPress={onViewChange} />
        </View>
        {activeView === 'sources' ? (
          <WorkbenchSourcesView />
        ) : activeView === 'artifact' ? (
          <WorkbenchArtifactView />
        ) : activeView === 'report' ? (
          <WorkbenchReportView />
        ) : activeView === 'context' ? (
          <WorkbenchContextView />
        ) : (
          <WorkbenchActivityView />
        )}
      </BottomSheetScrollView>
    </BottomSheetModal>
  );
});
