import { BottomSheetModal, BottomSheetModalProvider } from '@gorhom/bottom-sheet';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChatTopBar } from '../components/chat-top-bar';
import { ComposerStack } from '../components/composer-stack';
import { ConversationPanel } from '../components/conversation-panel';
import { SessionDrawer } from '../components/session-drawer';
import { WorkbenchSheet } from '../components/workbench-sheet';
import { makeMobilePreviewState } from '../fixtures/mobile-preview';
import type { MobilePreviewState } from '../fixtures/mobile-preview.types';
import { normalizeWorkbenchView, resolveMobileWorkbenchVisibleTabs } from '../config/workbench-tabs';
import type { WorkspaceView } from '../fixtures/ui-fixtures';

type ChatScreenProps = {
  previewState?: MobilePreviewState | 'default';
  composerMode?: 'default' | 'hitl' | 'clarification';
  showDrawer?: boolean;
};

function ChatScreenInner({
  previewState = 'default',
  composerMode,
  showDrawer = false,
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
  const sheetRef = useRef<BottomSheetModal>(null);
  /** present() 瞬间 Gorhom 可能回调 index -1，避免把 workbenchOpen 打回 false */
  const ignoreSheetClosedUntilRef = useRef(0);
  const [drawerOpen, setDrawerOpen] = useState(showDrawer);
  const [drawerExitInstant, setDrawerExitInstant] = useState(false);
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
  const [workbenchOpen, setWorkbenchOpen] = useState(false);
  const [attachmentSheetOpen, setAttachmentSheetOpen] = useState(false);

  const overlayBlocksConversation = workbenchOpen || drawerOpen || attachmentSheetOpen;

  const openWorkbench = useCallback((view: WorkspaceView = 'activity', snapIndex = 1) => {
    setDrawerOpen(false);
    setAttachmentSheetOpen(false);
    setWorkbenchView(view);
    setWorkbenchOpen(true);
    ignoreSheetClosedUntilRef.current = Date.now() + 600;
    sheetRef.current?.present();
    // present() 异步挂载 portal，稍后再 snap 到 60% detent
    setTimeout(() => {
      sheetRef.current?.snapToIndex(snapIndex);
    }, 80);
  }, []);

  const closeWorkbench = useCallback(() => {
    setWorkbenchOpen(false);
    sheetRef.current?.dismiss();
  }, []);

  const openDrawer = useCallback(() => {
    closeWorkbench();
    setAttachmentSheetOpen(false);
    setDrawerExitInstant(false);
    setDrawerOpen(true);
  }, [closeWorkbench]);

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
    closeWorkbench();
    setDrawerOpen(false);
    setAttachmentSheetOpen(true);
  }, [closeWorkbench]);

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

  // 仅 Stitch 预览帧：自动打开 Sheet（主路径 index 不跑 dismiss）
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

  return (
    <>
      <View
        className="flex-1 bg-canvas"
        style={{ paddingTop: insets.top }}
        pointerEvents="box-none"
      >
        <ChatTopBar
          title={fixture.title}
          underOverlay={workbenchOpen}
          onOpenDrawer={openDrawer}
          onOpenWorkbench={() => openWorkbench('activity')}
        />
        <ConversationPanel
          conversation={fixture.conversation}
          bottomInset={insets.bottom + 160}
          scrollEnabled={!overlayBlocksConversation}
          onOpenWorkbench={handleOpenWorkbenchFromConversation}
        />
        <ComposerStack
          {...composer}
          bottomInset={insets.bottom}
          suppressPlanOverlay={overlayBlocksConversation}
          attachmentSheetOpen={attachmentSheetOpen}
          onAttachmentSheetOpenChange={setAttachmentSheetOpen}
          onOpenAttachmentSheet={openAttachmentSheet}
        />
      </View>

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
