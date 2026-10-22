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
import { useThemeColors } from '@/lib/use-theme-colors';
import { AGENT_UI_LAYOUT } from '../config/ui.constants';
import { WorkbenchSheetWindowContainer } from './workbench-sheet-window-container';
import {
  normalizeWorkbenchView,
  resolveMobileWorkbenchVisibleTabs,
} from '../config/workbench-tabs';
import type { WorkbenchState } from '@harness/agent-ui-types';
import type { WorkspaceView } from '../fixtures/ui-fixtures';
import {
  WorkbenchActivityContent,
  type WorkbenchActivityEmphasis,
} from './workbench-activity-view';
import { WorkbenchArtifactBody } from './workbench-artifact-view';
import { WorkbenchRunControls } from './workbench-run-controls';
import { WorkbenchSegmentedTabs } from './workbench-segmented-tabs';

type WorkbenchSheetProps = {
  activeView: WorkspaceView;
  workbenchCount?: number;
  hasDeliverables?: boolean;
  activityEmphasis?: WorkbenchActivityEmphasis;
  workbench?: WorkbenchState;
  selectedToolCallId?: string | null;
  focusArtifactId?: string | null;
  onSelectToolCall?: (toolCallId: string) => void;
  onDismiss?: () => void;
  onRequestClose?: () => void;
  onViewChange?: (view: WorkspaceView) => void;
  onSheetIndexChange?: (index: number) => void;
  activeRunId?: string | null;
  onPauseRun?: () => void;
  onResumeRun?: () => void;
  workbenchReportId?: string;
};

export const WorkbenchSheet = forwardRef<BottomSheetModal, WorkbenchSheetProps>(function WorkbenchSheet(
  {
    activeView,
    workbenchCount = 0,
    hasDeliverables,
    activityEmphasis = 'default',
    workbench,
    selectedToolCallId,
    focusArtifactId,
    onSelectToolCall,
    onDismiss,
    onRequestClose,
    onViewChange,
    onSheetIndexChange,
    activeRunId,
    onPauseRun,
    onResumeRun,
    workbenchReportId,
  },
  ref,
) {
  const insets = useSafeAreaInsets();
  const themeColors = useThemeColors();
  const sheetBackgroundStyle = useMemo(
    () => ({
      backgroundColor: themeColors.surface,
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      borderTopWidth: 1,
      borderColor: themeColors.composerBorder,
    }),
    [themeColors.composerBorder, themeColors.surface],
  );
  const handleIndicatorStyle = useMemo(
    () => ({ backgroundColor: themeColors.border, width: 36 as const }),
    [themeColors.border],
  );
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
        <WorkbenchArtifactBody
          bottomInset={insets.bottom}
          useBottomSheetScroll
          workbench={workbench}
          focusArtifactId={focusArtifactId}
          reportId={workbenchReportId}
        />
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
        <WorkbenchActivityContent
          emphasis={activityEmphasis}
          workbench={workbench}
          selectedToolCallId={selectedToolCallId}
          onSelectToolCall={onSelectToolCall}
        />
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
      handleIndicatorStyle={handleIndicatorStyle}
      backgroundStyle={sheetBackgroundStyle}
    >
      <View className="gap-3 border-b border-composer-border px-4 pb-2.5 pt-1">
        <View className="flex-row items-center justify-between gap-2">
          <Text variant="headline" className="shrink text-[15px]">
            工作台
          </Text>
          <WorkbenchRunControls
            activityStatus={workbench?.activityStatus}
            activeRunId={activeRunId}
            onPause={onPauseRun}
            onResume={onResumeRun}
          />
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
