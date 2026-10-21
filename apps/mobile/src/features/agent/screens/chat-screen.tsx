import { BottomSheetModal, BottomSheetModalProvider } from '@gorhom/bottom-sheet';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChatTopBar } from '../components/chat-top-bar';
import { ComposerPeekBar } from '../components/composer-peek-bar';
import { ComposerStack } from '../components/composer-stack';
import { ConversationPanel } from '../components/conversation-panel';
import { ServiceBanner, type ServiceState } from '../components/service-banner';
import { SessionDrawer } from '../components/session-drawer';
import { WorkbenchPanel } from '../components/workbench-panel';
import { WorkbenchSheet } from '../components/workbench-sheet';
import { makeMobilePreviewState } from '../fixtures/mobile-preview';
import type { MobilePreviewState } from '../fixtures/mobile-preview.types';
import { normalizeWorkbenchView, resolveMobileWorkbenchVisibleTabs } from '../config/workbench-tabs';
import type { WorkspaceView } from '../fixtures/ui-fixtures';
import { AGENT_UI_LAYOUT } from '../config/ui.constants';
import { catalogPlanFixture } from '../fixtures/ui-catalog-fixtures';

type ChatScreenProps = {
  previewState?: MobilePreviewState | 'default';
  composerMode?: 'default' | 'hitl' | 'clarification';
  showDrawer?: boolean;
  /** Preview：强制 iPad 并排布局 */
  forceSplitLayout?: boolean;
};

function ChatScreenInner({
  previewState = 'default',
  composerMode,
  showDrawer = false,
  forceSplitLayout = false,
}: ChatScreenProps) {
  const fixture = useMemo(() => makeMobilePreviewState(previewState), [previewState]);
  const composer = useMemo(
    () => ({
      ...fixture.composer,
      ...(composerMode ? { mode: composerMode } : {}),
    }),
    [fixture.composer, composerMode],
  );

  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const isSplitLayout = forceSplitLayout || width >= 768;

  const sheetRef = useRef<BottomSheetModal>(null);
  const [drawerOpen, setDrawerOpen] = useState(showDrawer);
  const [drawerExitInstant, setDrawerExitInstant] = useState(false);
  const [serviceDismissed, setServiceDismissed] = useState(false);
  const [serviceState, setServiceState] = useState<ServiceState>(
    fixture.chrome?.serviceState ?? 'ready',
  );

  const workbenchConfig = fixture.workbench;
  const workbenchCount = workbenchConfig?.workbenchCount ?? 0;
  const hasDeliverables =
    workbenchConfig?.hasDeliverables ?? (workbenchConfig?.workbenchCount ?? 0) > 0;
  const activityEmphasis = workbenchConfig?.activityEmphasis ?? 'default';
  const visibleWorkbenchTabs = useMemo(
    () => resolveMobileWorkbenchVisibleTabs({ workbenchCount, hasDeliverables }),
    [workbenchCount, hasDeliverables],
  );
  const [workbenchView, setWorkbenchView] = useState<WorkspaceView>(() =>
    normalizeWorkbenchView(fixture.workbench?.initialView, visibleWorkbenchTabs),
  );
  const [workbenchOpen, setWorkbenchOpen] = useState(isSplitLayout);
  const openWorkbench = useCallback(
    (
      view: WorkspaceView = 'activity',
      snapIndex: number = AGENT_UI_LAYOUT.workbenchSheetDefaultSnapIndex,
    ) => {
      setWorkbenchView(view);
      if (isSplitLayout) {
        setWorkbenchOpen(true);
        return;
      }
      const sheet = sheetRef.current;
      if (!sheet) {
        return;
      }
      sheet.present();
      // 首次 mount 时 present 内 rAF 可能早于 sheet 挂载，补 snap 到目标 detent
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          sheetRef.current?.snapToIndex(snapIndex);
        });
      });
    },
    [isSplitLayout],
  );

  const closeWorkbench = useCallback(() => {
    if (isSplitLayout) {
      setWorkbenchOpen(true);
      return;
    }
    sheetRef.current?.dismiss();
  }, [isSplitLayout]);

  const openDrawer = useCallback(() => {
    setDrawerExitInstant(false);
    setDrawerOpen(true);
  }, []);

  const openSettingsFromDrawer = useCallback(() => {
    setDrawerExitInstant(true);
    setDrawerOpen(false);
    router.push('/settings');
  }, [router]);

  useEffect(() => {
    if (!drawerOpen) {
      setDrawerExitInstant(false);
    }
  }, [drawerOpen]);

  const handleOpenWorkbenchFromConversation = useCallback(
    (view?: WorkspaceView) => {
      openWorkbench(view ?? 'activity');
    },
    [openWorkbench],
  );

  useEffect(() => {
    if (previewState === 'default') {
      return;
    }
    const nextView = normalizeWorkbenchView(fixture.workbench?.initialView, visibleWorkbenchTabs);
    setWorkbenchView(nextView);
    const initialIndex = fixture.workbench?.initialSheetIndex ?? -1;
    if (initialIndex >= 0) {
      openWorkbench(nextView, initialIndex);
    }
  }, [
    previewState,
    fixture.workbench?.initialView,
    fixture.workbench?.initialSheetIndex,
    visibleWorkbenchTabs,
    openWorkbench,
  ]);

  const chrome = fixture.chrome;
  const connectionState = chrome?.connectionState ?? 'live';
  const runSummary = chrome?.runSummary;
  const showPeek =
    composer.submitting && !isSplitLayout && Boolean(chrome?.peekBarTitle);
  const peekTitle =
    chrome?.peekBarTitle ??
    catalogPlanFixture.plan.find((s) => s.status === 'in_progress')?.step ??
    '正在执行任务';

  const showServiceBanner = !serviceDismissed && serviceState !== 'ready';

  return (
    <>
      <View
        className="flex-1 bg-canvas"
        style={{ paddingTop: insets.top }}
        pointerEvents="box-none"
      >
        <ChatTopBar
          title={fixture.title}
          runSummary={runSummary}
          connectionState={connectionState}
          onOpenDrawer={openDrawer}
          onOpenWorkbench={() => openWorkbench('activity')}
        />
        {showServiceBanner ? (
          <ServiceBanner
            state={serviceState}
            onRetry={() => setServiceState('checking')}
            onDismiss={() => setServiceDismissed(true)}
          />
        ) : null}

        <View className="flex-1 flex-row">
          <View className={isSplitLayout ? 'flex-1' : 'flex-1'}>
            <ConversationPanel
              conversation={fixture.conversation}
              bottomInset={insets.bottom + (showPeek ? 200 : 160)}
              scrollEnabled
              onOpenWorkbench={handleOpenWorkbenchFromConversation}
            />
            {showPeek ? (
              <ComposerPeekBar
                title={peekTitle}
                subtitle={chrome?.peekBarSubtitle}
                onPress={() => openWorkbench('activity')}
              />
            ) : null}
            <ComposerStack {...composer} bottomInset={insets.bottom} />
          </View>
          {isSplitLayout && workbenchOpen ? (
            <WorkbenchPanel
              activeView={workbenchView}
              workbenchCount={workbenchCount}
              hasDeliverables={hasDeliverables}
              activityEmphasis={activityEmphasis}
              onViewChange={setWorkbenchView}
            />
          ) : null}
        </View>
      </View>

      <SessionDrawer
        visible={drawerOpen}
        exitInstant={drawerExitInstant}
        onClose={() => setDrawerOpen(false)}
        onOpenSettings={openSettingsFromDrawer}
      />

      {!isSplitLayout ? (
        <WorkbenchSheet
          ref={sheetRef}
          activeView={workbenchView}
          workbenchCount={workbenchCount}
          hasDeliverables={hasDeliverables}
          activityEmphasis={activityEmphasis}
          onRequestClose={closeWorkbench}
          onViewChange={setWorkbenchView}
        />
      ) : null}
    </>
  );
}

export function ChatScreen(props: ChatScreenProps) {
  return (
    <BottomSheetModalProvider>
      <ChatScreenInner {...props} />
    </BottomSheetModalProvider>
  );
}
