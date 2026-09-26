import BottomSheet from '@gorhom/bottom-sheet';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
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
  /** 预览帧覆盖 Composer 模式（如 HITL 帧） */
  composerMode?: 'default' | 'hitl' | 'clarification';
  showDrawer?: boolean;
};

export function ChatScreen({
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
  const sheetRef = useRef<BottomSheet>(null);
  const [drawerOpen, setDrawerOpen] = useState(showDrawer);
  const [workbenchView, setWorkbenchView] = useState<WorkspaceView>(
    fixture.workbench?.initialView ?? 'activity',
  );
  const [workbenchIndex, setWorkbenchIndex] = useState(fixture.workbench?.initialSheetIndex ?? -1);
  const workbenchCount = fixture.workbench?.workbenchCount ?? 3;

  useEffect(() => {
    setWorkbenchView(fixture.workbench?.initialView ?? 'activity');
    setWorkbenchIndex(fixture.workbench?.initialSheetIndex ?? -1);
  }, [previewState, fixture.workbench?.initialView, fixture.workbench?.initialSheetIndex]);

  const openWorkbench = useCallback((view: WorkspaceView = 'activity', index = 1) => {
    setDrawerOpen(false);
    setWorkbenchView(view);
    setWorkbenchIndex(index);
  }, []);

  const closeWorkbench = useCallback(() => {
    setWorkbenchIndex(-1);
  }, []);

  const openDrawer = useCallback(() => {
    setWorkbenchIndex(-1);
    setDrawerOpen(true);
  }, []);

  return (
    <View className="flex-1 bg-canvas">
      <View className="flex-1" style={{ paddingTop: insets.top }}>
        <ChatTopBar
          title={fixture.title}
          onOpenDrawer={openDrawer}
          onOpenWorkbench={() => openWorkbench('activity')}
        />
        <ConversationPanel
          conversation={fixture.conversation}
          bottomInset={insets.bottom + 160}
          onOpenWorkbench={openWorkbench}
        />
        <ComposerStack {...composer} bottomInset={insets.bottom} />
      </View>

      <View style={styles.sheetHost} pointerEvents="box-none">
        <WorkbenchSheet
          ref={sheetRef}
          activeView={workbenchView}
          workbenchCount={workbenchCount}
          sheetIndex={workbenchIndex}
          onSheetIndexChange={setWorkbenchIndex}
          onClose={closeWorkbench}
        />
      </View>

      <SessionDrawer
        visible={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        onOpenSettings={() => {
          setDrawerOpen(false);
          router.push('/settings');
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  sheetHost: {
    ...StyleSheet.absoluteFill,
    zIndex: 30,
    elevation: 30,
  },
});
