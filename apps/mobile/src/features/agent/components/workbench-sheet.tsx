import BottomSheet, { BottomSheetBackdrop, type BottomSheetBackdropProps } from '@gorhom/bottom-sheet';
import { forwardRef, useCallback, useMemo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
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
  sheetIndex: number;
  onSheetIndexChange?: (index: number) => void;
  onClose?: () => void;
};

export const WorkbenchSheet = forwardRef<BottomSheet, WorkbenchSheetProps>(function WorkbenchSheet(
  { activeView, workbenchCount = 3, sheetIndex, onSheetIndexChange, onClose },
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
    <BottomSheet
      ref={ref}
      index={sheetIndex}
      onChange={onSheetIndexChange}
      snapPoints={snapPoints}
      enablePanDownToClose
      style={styles.sheet}
      containerStyle={styles.sheetContainer}
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
      <View className="flex-1">
        <View className="gap-3 border-b border-composer-border px-4 pb-2.5 pt-1">
          <View className="flex-row items-center justify-between">
            <Text variant="headline" className="text-[15px]">
              工作台 ({workbenchCount})
            </Text>
            <Pressable
              onPress={onClose}
              className="h-7 w-7 items-center justify-center rounded-full active:bg-subtle"
              accessibilityLabel="关闭工作台"
            >
              <X size={20} color="#555551" />
            </Pressable>
          </View>
          <WorkbenchSegmentedTabs tabs={tabs} active={activeView} />
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
      </View>
    </BottomSheet>
  );
});

const styles = StyleSheet.create({
  sheetContainer: {
    ...StyleSheet.absoluteFill,
    zIndex: 30,
  },
  sheet: {
    flex: 1,
  },
});
