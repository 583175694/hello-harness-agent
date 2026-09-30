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
  const [drawerOpen, setDrawerOpen] = useState(showDrawer);
  const [workbenchView, setWorkbenchView] = useState<WorkspaceView>(
    fixture.workbench?.initialView ?? 'activity',
  );
  const workbenchCount = fixture.workbench?.workbenchCount ?? 3;

  const openWorkbench = useCallback((view: WorkspaceView = 'activity', snapIndex = 1) => {
    setDrawerOpen(false);
    setWorkbenchView(view);
    sheetRef.current?.present();
    // present() 异步挂载 portal，稍后再 snap 到 60% detent
    setTimeout(() => {
      sheetRef.current?.snapToIndex(snapIndex);
    }, 80);
  }, []);

  const closeWorkbench = useCallback(() => {
    sheetRef.current?.dismiss();
  }, []);

  const openDrawer = useCallback(() => {
    closeWorkbench();
    setDrawerOpen(true);
  }, [closeWorkbench]);

  // 仅 Stitch 预览帧：自动打开 Sheet（主路径 index 不跑 dismiss）
  useEffect(() => {
    if (previewState === 'default') {
      return;
    }
    setWorkbenchView(fixture.workbench?.initialView ?? 'activity');
    const initialIndex = fixture.workbench?.initialSheetIndex ?? -1;
    if (initialIndex >= 0) {
      openWorkbench(fixture.workbench?.initialView ?? 'activity', initialIndex);
    }
  }, [previewState, fixture.workbench?.initialView, fixture.workbench?.initialSheetIndex, openWorkbench]);

  return (
    <>
      <View className="flex-1 bg-canvas" style={{ paddingTop: insets.top }}>
        <ChatTopBar
          title={fixture.title}
          onOpenDrawer={openDrawer}
          onOpenWorkbench={() => openWorkbench('activity')}
        />
        <ConversationPanel
          conversation={fixture.conversation}
          bottomInset={insets.bottom + 160}
          onOpenWorkbench={(view) => openWorkbench(view ?? 'activity')}
        />
        <ComposerStack {...composer} bottomInset={insets.bottom} />
      </View>

      <WorkbenchSheet
        ref={sheetRef}
        activeView={workbenchView}
        workbenchCount={workbenchCount}
        onRequestClose={closeWorkbench}
        onViewChange={setWorkbenchView}
      />

      <SessionDrawer
        visible={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        onOpenSettings={() => {
          setDrawerOpen(false);
          router.push('/settings');
        }}
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
