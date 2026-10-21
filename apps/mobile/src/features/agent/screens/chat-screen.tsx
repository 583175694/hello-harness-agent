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
  const ignoreSheetClosedUntilRef = useRef(0);
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
  const [attachmentSheetOpen, setAttachmentSheetOpen] = useState(false);

  const overlayBlocksConversation =
    (!isSplitLayout && workbenchOpen) || drawerOpen || attachmentSheetOpen;

  const openWorkbench = useCallback(
    (view: WorkspaceView = 'activity', snapIndex = 1) => {
      setDrawerOpen(false);
      setAttachmentSheetOpen(false);
      setWorkbenchView(view);
      if (isSplitLayout) {
        setWorkbenchOpen(true);
        return;
      }
      setWorkbenchOpen(true);
      ignoreSheetClosedUntilRef.current = Date.now() + 600;
      sheetRef.current?.present();
      setTimeout(() => {
        sheetRef.current?.snapToIndex(snapIndex);
      }, 80);
    },
    [isSplitLayout],
  );

  const closeWorkbench = useCallback(() => {
    if (isSplitLayout) {
      setWorkbenchOpen(true);
      return;
    }
    setWorkbenchOpen(false);
    sheetRef.current?.dismiss();
  }, [isSplitLayout]);

  const openDrawer = useCallback(() => {
    if (!isSplitLayout) {
      closeWorkbench();
    }
    setAttachmentSheetOpen(false);
    setDrawerExitInstant(false);
    setDrawerOpen(true);
  }, [closeWorkbench, isSplitLayout]);

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

  const openAttachmentSheet = useCallback(() => {
    if (!isSplitLayout) closeWorkbench();
    setDrawerOpen(false);
    setAttachmentSheetOpen(true);
  }, [closeWorkbench, isSplitLayout]);

  const handleOpenWorkbenchFromConversation = useCallback(
    (view?: WorkspaceView) => {
      openWorkbench(view ?? 'activity');
    },
    [openWorkbench],
  );

  const handleWorkbenchModalDismiss = useCallback(() => {
    setWorkbenchOpen(false);
  }, []);

  const handleSheetIndexChange = useCallback((index: number) => {
    if (index >= 0) {
      return;
    }
    if (Date.now() < ignoreSheetClosedUntilRef.current) {
      return;
    }
    setWorkbenchOpen(false);
  }, []);

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
    composer.submitting &&
    !isSplitLayout &&
    !workbenchOpen &&
    !drawerOpen &&
    !attachmentSheetOpen &&
    Boolean(chrome?.peekBarTitle);
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
          underOverlay={!isSplitLayout && workbenchOpen}
          workbenchCount={workbenchCount}
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
              scrollEnabled={!overlayBlocksConversation}
              onOpenWorkbench={handleOpenWorkbenchFromConversation}
            />
            {showPeek ? (
              <ComposerPeekBar
                title={peekTitle}
                subtitle={chrome?.peekBarSubtitle}
                onPress={() => openWorkbench('activity', 1)}
              />
            ) : null}
            <ComposerStack
              {...composer}
              bottomInset={insets.bottom}
              suppressPlanOverlay={overlayBlocksConversation}
              attachmentSheetOpen={attachmentSheetOpen}
              onAttachmentSheetOpenChange={setAttachmentSheetOpen}
              onOpenAttachmentSheet={openAttachmentSheet}
            />
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

      {!isSplitLayout ? (
        <WorkbenchSheet
          ref={sheetRef}
          activeView={workbenchView}
          workbenchCount={workbenchCount}
          hasDeliverables={hasDeliverables}
          activityEmphasis={activityEmphasis}
          onDismiss={handleWorkbenchModalDismiss}
          onRequestClose={closeWorkbench}
          onViewChange={setWorkbenchView}
          onSheetIndexChange={handleSheetIndexChange}
        />
      ) : null}

      <SessionDrawer
        visible={drawerOpen}
        exitInstant={drawerExitInstant}
        onClose={() => setDrawerOpen(false)}
        onOpenSettings={openSettingsFromDrawer}
      />
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
