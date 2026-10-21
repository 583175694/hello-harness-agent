import {
  BottomSheetBackdrop,
  BottomSheetModal,
  BottomSheetScrollView,
  type BottomSheetBackdropProps,
} from '@gorhom/bottom-sheet';
import { forwardRef, useCallback, useEffect, useMemo } from 'react';
import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { X } from 'lucide-react-native';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { OVERLAY_SCRIM_OPACITY } from '@/lib/theme';
import { AGENT_UI_LAYOUT } from '../config/ui.constants';
import { WorkbenchSheetWindowContainer } from './workbench-sheet-window-container';
import {
  normalizeWorkbenchView,
  resolveMobileWorkbenchVisibleTabs,
} from '../config/workbench-tabs';
import type { WorkspaceView } from '../fixtures/ui-fixtures';
import {
  WorkbenchActivityContent,
  type WorkbenchActivityEmphasis,
} from './workbench-activity-view';
import { WorkbenchArtifactBody } from './workbench-artifact-view';
import { WorkbenchSegmentedTabs } from './workbench-segmented-tabs';

type WorkbenchSheetProps = {
  activeView: WorkspaceView;
  workbenchCount?: number;
  hasDeliverables?: boolean;
  activityEmphasis?: WorkbenchActivityEmphasis;
  onDismiss?: () => void;
  onRequestClose?: () => void;
  onViewChange?: (view: WorkspaceView) => void;
  onSheetIndexChange?: (index: number) => void;
};

export const WorkbenchSheet = forwardRef<BottomSheetModal, WorkbenchSheetProps>(function WorkbenchSheet(
  {
    activeView,
    workbenchCount = 0,
    hasDeliverables,
    activityEmphasis = 'default',
    onDismiss,
    onRequestClose,
    onViewChange,
    onSheetIndexChange,
  },
  ref,
) {
  const insets = useSafeAreaInsets();
  const snapPoints = useMemo(
    () => [...AGENT_UI_LAYOUT.workbenchSheetSnapPoints],
    [],
  );
  const topInset = useMemo(() => AGENT_UI_LAYOUT.workbenchTopInset(insets.top), [insets.top]);

  const sheetScrollPaddingBottom = Math.max(insets.bottom, 16) + 8;

  const visibleTabs = useMemo(
    () => resolveMobileWorkbenchVisibleTabs({ workbenchCount, hasDeliverables }),
    [workbenchCount, hasDeliverables],
  );

  const showTabBar = visibleTabs.length > 1;

  useEffect(() => {
    const normalized = normalizeWorkbenchView(activeView, visibleTabs);
    if (normalized !== activeView) {
      onViewChange?.(normalized);
    }
  }, [activeView, visibleTabs, onViewChange]);

  const handleSheetChange = useCallback(
    (index: number) => {
      onSheetIndexChange?.(index);
    },
    [onSheetIndexChange],
  );

  const handleDismiss = useCallback(() => {
    onSheetIndexChange?.(-1);
    onDismiss?.();
  }, [onDismiss, onSheetIndexChange]);

  const renderBackdrop = useCallback(
    (props: BottomSheetBackdropProps) => (
      <BottomSheetBackdrop
        {...props}
        disappearsOnIndex={-1}
        appearsOnIndex={0}
        opacity={OVERLAY_SCRIM_OPACITY}
      />
    ),
    [],
  );

  const renderTabBody = () => {
    if (activeView === 'artifact') {
      return (
        <WorkbenchArtifactBody bottomInset={insets.bottom} useBottomSheetScroll />
      );
    }

    return (
      <BottomSheetScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: sheetScrollPaddingBottom }}
        showsVerticalScrollIndicator={false}
        overScrollMode="never"
        keyboardShouldPersistTaps="handled"
      >
        <WorkbenchActivityContent emphasis={activityEmphasis} />
      </BottomSheetScrollView>
    );
  };

  const defaultSnapIndex = AGENT_UI_LAYOUT.workbenchSheetDefaultSnapIndex;

  return (
    <BottomSheetModal
      ref={ref}
      index={defaultSnapIndex}
      snapPoints={snapPoints}
      enableDynamicSizing={false}
      topInset={topInset}
      containerComponent={WorkbenchSheetWindowContainer}
      enablePanDownToClose
      onChange={handleSheetChange}
      onDismiss={handleDismiss}
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
      <View className="gap-3 border-b border-composer-border px-4 pb-2.5 pt-1">
        <View className="flex-row items-center justify-between">
          <Text variant="headline" className="text-[15px]">
            工作台
          </Text>
          <Pressable
            onPress={onRequestClose}
            className="h-10 w-10 items-center justify-center rounded-full active:bg-subtle"
            accessibilityLabel="关闭工作台"
            accessibilityRole="button"
          >
            <Icon icon={X} tone="secondary" size={20} />
          </Pressable>
        </View>
        {showTabBar ? (
          <WorkbenchSegmentedTabs tabs={visibleTabs} active={activeView} onTabPress={onViewChange} />
        ) : null}
      </View>

      {renderTabBody()}
    </BottomSheetModal>
  );
});
